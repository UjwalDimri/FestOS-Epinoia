import { MerchIssue, MerchStock, Participant } from '../models/index.js';
import { runCommand } from './command.js';
import { conflict, badRequest, notFound } from '../utils/errors.js';

export const ITEM_ENTITLEMENT_NOTE = 'T-shirt: participants; ID card and lanyard: everyone';

// Issue one item once. The unique index on (participantId, item) is the real guard; the pre-check gives a helpful message.
export async function issueMerch({ user, participantId, item, size, desk }) {
  const p = await Participant.findOne({ participantId }).lean();
  if (!p) throw notFound(`No participant ${participantId}`);
  const existing = await MerchIssue.findOne({ participantId, item, kind: 'original' }).lean();
  if (existing) {
    throw conflict('Already issued. Do not hand this out again.', {
      original: { issuedAt: existing.issuedAt, desk: existing.desk, issuedBy: existing.issuedBy, size: existing.size },
      replacementPath: 'Use "replacement" with a reason and Merchandise Desk lead or Director approval.',
    });
  }
  const stock = await MerchStock.findOne({ item, size: size || '-' });
  if (!stock) throw badRequest(`No stock line for ${item} size ${size || '-'}`);
  const available = stock.quantity - stock.reserved - stock.issued;
  if (available <= 0) throw conflict(`No ${item} size ${size || '-'} left (${stock.issued} issued).`, { available });
  return runCommand({ user, action: 'MERCH_ISSUE', entity: { type: 'Participant', id: participantId }, event: 'merch.issued' }, async (session) => {
    await MerchIssue.create([{ participantId, item, size: size || '-', kind: 'original', desk, issuedBy: user.userId, issuedByRole: user.role, issuedAt: new Date() }], { session });
    await MerchStock.updateOne({ item, size: size || '-' }, { $inc: { issued: 1 } }, { session });
    return { summary: { item, size, desk }, result: { issued: true, participantId, item, size: size || '-' } };
  });
}

export async function replaceMerch({ user, participantId, item, size, reason }) {
  const original = await MerchIssue.findOne({ participantId, item, kind: 'original' }).lean();
  if (!original) throw badRequest('Nothing to replace: no original issue on record');
  return runCommand({ user, action: 'MERCH_REPLACE', entity: { type: 'Participant', id: participantId }, reason, risk: 'medium', event: 'merch.replaced' }, async (session) => {
    await MerchIssue.create([{ participantId, item, size: size || original.size, kind: 'replacement', substitutionFrom: original.size,
      desk: original.desk, issuedBy: user.userId, issuedByRole: user.role, reason, issuedAt: new Date() }], { session });
    return { summary: { item, reason }, result: { replaced: true } };
  });
}

export async function merchForecast() {
  const stock = await MerchStock.find({}).lean();
  const issued = await MerchIssue.aggregate([{ $match: { kind: 'original' } }, { $group: { _id: { item: '$item', size: '$size' }, n: { $sum: 1 } } }]);
  return stock.map((s) => {
    const used = issued.find((i) => i._id.item === s.item && i._id.size === s.size)?.n || 0;
    return { item: s.item, size: s.size, quantity: s.quantity, reserved: s.reserved, issued: used, remaining: s.quantity - s.reserved - used };
  });
}
