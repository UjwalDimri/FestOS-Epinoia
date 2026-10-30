import { MerchCatalog, MerchIssue, MerchStock, Participant } from '../models/index.js';
import { runCommand } from './command.js';
import { conflict, badRequest, notFound } from '../utils/errors.js';

export const ITEM_ENTITLEMENT_NOTE = 'T-shirt: participants; ID card and lanyard: everyone';

function defaultEligibility(item) {
  return /\b(id card|lanyard)\b/i.test(item) ? 'everyone' : 'participants';
}

export async function saveMerchandise({ user, item, name, description = '', eligibility, stocks = [] }) {
  item = String(item || '').trim();
  name = String(name || item).trim();
  if (!item || !name) throw badRequest('item and name are required');
  const rule = eligibility || defaultEligibility(item);
  if (!['participants', 'everyone'].includes(rule)) throw badRequest('eligibility must be participants or everyone');
  if (!Array.isArray(stocks) || !stocks.length) throw badRequest('Add at least one size and stock line');
  const clean = stocks.map((line) => ({
    size: String(line.size || '-').trim() || '-', quantity: Number(line.quantity), reserved: Number(line.reserved || 0),
  }));
  if (clean.some((line) => !Number.isInteger(line.quantity) || line.quantity < 0 || !Number.isInteger(line.reserved) || line.reserved < 0 || line.reserved > line.quantity)) {
    throw badRequest('Stock quantity and reserved must be non-negative integers, with reserved no greater than quantity');
  }
  if (new Set(clean.map((line) => line.size)).size !== clean.length) throw badRequest('Each size may appear only once');
  for (const line of clean) {
    const old = await MerchStock.findOne({ item, size: line.size }).lean();
    if (old && line.quantity < (old.issued || 0) + line.reserved) throw conflict(`Cannot reduce ${item} ${line.size} below issued plus reserved stock`, { issued: old.issued || 0, reserved: line.reserved });
  }
  return runCommand({ user, action: 'MERCH_CATALOG_UPDATED', entity: { type: 'Merchandise', id: item }, event: 'merch.catalog_updated' }, async (session) => {
    const opts = session ? { session } : {};
    const catalog = await MerchCatalog.findOneAndUpdate({ item }, {
      $set: { name, description: String(description), eligibility: rule, sizes: clean.map((line) => line.size), active: true },
    }, { upsert: true, new: true, setDefaultsOnInsert: true, ...opts }).lean();
    for (const line of clean) {
      await MerchStock.updateOne({ item, size: line.size }, { $set: { quantity: line.quantity, reserved: line.reserved }, $setOnInsert: { issued: 0 } }, { upsert: true, ...opts });
    }
    return { summary: { item, name, sizes: clean.map((line) => line.size) }, result: catalog };
  });
}

export async function merchandiseCatalogue() {
  const [catalogue, stock] = await Promise.all([MerchCatalog.find({ active: true }).sort({ name: 1 }).lean(), merchForecast()]);
  const byItem = new Map();
  for (const line of stock) {
    if (!byItem.has(line.item)) byItem.set(line.item, []);
    byItem.get(line.item).push(line);
  }
  const known = new Set(catalogue.map((entry) => entry.item));
  const entries = catalogue.map((entry) => ({ ...entry, stock: byItem.get(entry.item) || [] }));
  // Older imported databases may have stock before the catalogue collection existed.
  for (const item of new Set(stock.map((line) => line.item).filter((value) => !known.has(value)))) {
    entries.push({ item, name: item, description: '', eligibility: defaultEligibility(item), sizes: (byItem.get(item) || []).map((line) => line.size), active: true, stock: byItem.get(item) || [] });
  }
  return entries;
}

export async function issueMerch({ user, participantId, item, size, desk }) {
  participantId = String(participantId || '').trim(); item = String(item || '').trim(); size = String(size || '-').trim() || '-';
  if (!participantId || !item) throw badRequest('participantId and item are required');
  const p = await Participant.findOne({ participantId }).lean();
  if (!p) throw notFound(`No participant ${participantId}`);
  if (p.active === false || p.quarantined || p.mergedInto) throw conflict('This participant record is inactive or under review and cannot receive merchandise.');
  const catalog = await MerchCatalog.findOne({ item, active: true }).lean();
  const eligibility = catalog?.eligibility || defaultEligibility(item);
  if (eligibility === 'participants' && p.personType !== 'participant') throw conflict(`${catalog?.name || item} is reserved for registered participants.`, { personType: p.personType, eligibility });
  if (catalog?.sizes?.length && !catalog.sizes.includes(size)) throw badRequest(`Size ${size} is not offered for ${catalog.name}`, { sizes: catalog.sizes });
  const existing = await MerchIssue.findOne({ participantId, item, kind: 'original' }).lean();
  if (existing) throw conflict('Already issued. Do not hand this out again.', {
    original: { issuedAt: existing.issuedAt, returnedAt: existing.returnedAt, desk: existing.desk, issuedBy: existing.issuedBy, size: existing.size },
    replacementPath: 'Use the replacement flow with a reason and Merchandise Desk lead or Director approval.',
  });
  const stock = await MerchStock.findOne({ item, size }).lean();
  if (!stock) throw badRequest(`No stock line for ${item} size ${size}`);
  return runCommand({ user, action: 'MERCH_ISSUE', entity: { type: 'Participant', id: participantId }, event: 'merch.issued' }, async (session) => {
    const opts = session ? { session } : {};
    const reservation = await MerchStock.updateOne({ item, size, $expr: { $lt: ['$issued', { $subtract: ['$quantity', '$reserved'] }] } }, { $inc: { issued: 1 } }, opts);
    if (!reservation.modifiedCount) throw conflict(`No ${item} size ${size} left.`, { available: Math.max(0, stock.quantity - stock.reserved - stock.issued) });
    try {
      await MerchIssue.create([{ participantId, item, size, kind: 'original', desk, issuedBy: user.userId, issuedByRole: user.role, issuedAt: new Date() }], opts);
    } catch (error) {
      if (!session) await MerchStock.updateOne({ item, size }, { $inc: { issued: -1 } });
      throw error;
    }
    return { summary: { item, size, desk }, result: { issued: true, participantId, item, size } };
  });
}

export async function returnMerch({ user, issueId, participantId, item, reason }) {
  if (!issueId && (!participantId || !item)) throw badRequest('issueId or participantId and item are required');
  const query = issueId ? { _id: issueId } : { participantId, item, kind: 'original' };
  const issue = await MerchIssue.findOne(query).lean();
  if (!issue) throw notFound('No merchandise issue found');
  if (!reason || reason.trim().length < 5) throw badRequest('A return reason (at least 5 characters) is required');
  if (issue.returnedAt) throw conflict('This merchandise issue has already been returned.', { returnedAt: issue.returnedAt });
  return runCommand({ user, action: 'MERCH_RETURN', entity: { type: 'MerchIssue', id: String(issue._id) }, reason, event: 'merch.returned' }, async (session) => {
    const opts = session ? { session } : {};
    const restocked = await MerchStock.updateOne({ item: issue.item, size: issue.size, issued: { $gt: 0 } }, { $inc: { issued: -1 } }, opts);
    if (!restocked.modifiedCount) throw conflict('Stock record is inconsistent; return was not applied.');
    const returnedAt = new Date();
    const returned = await MerchIssue.updateOne({ _id: issue._id, returnedAt: null }, { $set: { returnedAt, returnReason: reason.trim() } }, opts);
    if (!returned.modifiedCount) {
      if (!session) await MerchStock.updateOne({ item: issue.item, size: issue.size }, { $inc: { issued: 1 } });
      throw conflict('This merchandise issue has already been returned.');
    }
    return { summary: { item: issue.item, size: issue.size, participantId: issue.participantId }, result: { returned: true, issueId: String(issue._id), returnedAt } };
  });
}

export async function replaceMerch({ user, participantId, item, size, reason }) {
  const original = await MerchIssue.findOne({ participantId, item, kind: 'original' }).lean();
  if (!original) throw badRequest('Nothing to replace: no original issue on record');
  if (!reason || reason.trim().length < 5) throw badRequest('A replacement reason (at least 5 characters) is required');
  const replacementSize = size || original.size;
  return runCommand({ user, action: 'MERCH_REPLACE', entity: { type: 'Participant', id: participantId }, reason, risk: 'medium', event: 'merch.replaced' }, async (session) => {
    const opts = session ? { session } : {};
    const stock = await MerchStock.findOne({ item, size: replacementSize }).lean();
    if (!stock) throw badRequest(`No stock line for ${item} size ${replacementSize}`);
    const reserved = await MerchStock.updateOne({ item, size: replacementSize, $expr: { $lt: ['$issued', { $subtract: ['$quantity', '$reserved'] }] } }, { $inc: { issued: 1 } }, opts);
    if (!reserved.modifiedCount) throw conflict(`No ${item} size ${replacementSize} left.`);
    try {
      await MerchIssue.create([{ participantId, item, size: replacementSize, kind: 'replacement', substitutionFrom: original.size,
        desk: original.desk, issuedBy: user.userId, issuedByRole: user.role, reason, issuedAt: new Date() }], opts);
    } catch (error) {
      if (!session) await MerchStock.updateOne({ item, size: replacementSize }, { $inc: { issued: -1 } });
      throw error;
    }
    return { summary: { item, reason }, result: { replaced: true } };
  });
}

export async function merchForecast() {
  const stock = await MerchStock.find({}).sort({ item: 1, size: 1 }).lean();
  return stock.map((s) => ({ item: s.item, size: s.size, quantity: s.quantity, reserved: s.reserved, issued: s.issued || 0, remaining: s.quantity - s.reserved - (s.issued || 0) }));
}

export async function merchIssues() {
  const issues = await MerchIssue.find({}).sort({ issuedAt: -1 }).limit(500).lean();
  const people = await Participant.find({ participantId: { $in: [...new Set(issues.map((issue) => issue.participantId))] } }).select('participantId name').lean();
  const names = new Map(people.map((person) => [person.participantId, person.name]));
  return issues.map((issue) => ({ ...issue, participantName: names.get(issue.participantId) || 'Unknown participant', status: issue.returnedAt ? 'returned' : 'issued' }));
}
