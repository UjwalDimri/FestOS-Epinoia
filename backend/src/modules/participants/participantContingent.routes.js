import express from 'express';
import crypto from 'node:crypto';
import { parse as parseCsv } from 'csv-parse/sync';
import * as M from '../../models/index.js';
import { ah, badRequest, conflict, notFound } from '../../utils/errors.js';
import { requirePerm } from '../../middleware/auth.js';
import { maskParticipant } from '../../middleware/fieldMask.js';
import { appendAudit, runCommand } from '../../services/command.js';

export const participantContingent = express.Router();
const participantWriteFields = new Set([
  'participantId', 'firstName', 'lastName', 'name', 'email', 'contact', 'gender', 'age', 'isMinor', 'college', 'contingentId',
  'personType', 'isLeader', 'accessibilityNeeds', 'dietaryNeeds', 'arrivalDateTime', 'departureDateTime', 'arrivalMode',
  'arrivalLocation', 'departureLocation', 'accommodationRequested', 'tshirtSize', 'housingCategory', 'source', 'sourceRowId', 'internalNotes',
]);
const contingentWriteFields = new Set([
  'contingentId', 'college', 'collegeCode', 'collegeCity', 'collegeState', 'collegeContactPerson', 'contactEmail', 'contactPhone',
  'leader', 'leaderParticipantId', 'escort', 'escortPersonId', 'strengthDeclared', 'preferencesRaw', 'preferences', 'status',
  'arrivalDateTime', 'departureDateTime', 'internalNotes',
]);
const dateFields = new Set(['arrivalDateTime', 'departureDateTime']);
const emailRx = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const clean = (v) => typeof v === 'string' ? v.trim() : v;
function pick(body, fields) {
  const out = {};
  for (const [k, v] of Object.entries(body || {})) if (fields.has(k)) out[k] = clean(v);
  return out;
}
function parseDates(data) {
  for (const k of dateFields) if (data[k] != null && data[k] !== '') {
    const d = new Date(data[k]);
    if (Number.isNaN(d.getTime())) throw badRequest(`${k} must be a valid date`);
    data[k] = d;
  }
  if (data.arrivalDateTime && data.departureDateTime && data.departureDateTime <= data.arrivalDateTime) throw badRequest('departureDateTime must be after arrivalDateTime');
}
function issuesFor(p) {
  const issues = [];
  if (!p.name && !p.firstName && !p.lastName) issues.push({ code: 'missing_name', severity: 'critical' });
  if (!p.contingentId || !p.college) issues.push({ code: 'missing_contingent_or_college', severity: 'critical' });
  if (!p.contact && !p.email) issues.push({ code: 'missing_contact', severity: 'warning' });
  if (p.email && !emailRx.test(p.email)) issues.push({ code: 'invalid_email', severity: 'warning' });
  if (!p.arrivalDateTime) issues.push({ code: 'missing_arrival', severity: 'warning' });
  if (!p.departureDateTime) issues.push({ code: 'missing_departure', severity: 'warning' });
  if (p.dietaryNeeds?.status === 'unknown' || !p.dietaryNeeds) issues.push({ code: 'dietary_unknown', severity: 'info' });
  if (p.accessibilityNeeds?.status === 'not_declared' || !p.accessibilityNeeds) issues.push({ code: 'accessibility_unknown', severity: 'info' });
  return { issues, dataQuality: issues.some((i) => i.severity === 'critical') ? 'needs_review' : issues.length ? 'incomplete' : 'complete' };
}
function mapImportRow(row, mapping, type) {
  const data = {};
  for (const [column, field] of Object.entries(mapping || {})) if ((type === 'participant' ? participantWriteFields : contingentWriteFields).has(field)) data[field] = clean(row[column]);
  if (type === 'participant') {
    if (!data.participantId) return { error: 'participantId mapping and value are required' };
    if (!data.name && (data.firstName || data.lastName)) data.name = [data.firstName, data.lastName].filter(Boolean).join(' ');
    if (data.email && !emailRx.test(data.email)) return { error: 'email is invalid' };
    if (data.age != null && data.age !== '') { data.age = Number(data.age); if (!Number.isFinite(data.age) || data.age < 0 || data.age > 120) return { error: 'age must be from 0 to 120' }; }
  } else {
    if (!data.contingentId || !data.college) return { error: 'contingentId and college are required' };
    if (data.strengthDeclared != null) { data.strengthDeclared = Number(data.strengthDeclared); if (!Number.isInteger(data.strengthDeclared) || data.strengthDeclared < 0) return { error: 'strengthDeclared must be a non-negative integer' }; }
  }
  try { parseDates(data); } catch (e) { return { error: e.message }; }
  return { data };
}
function pageArgs(query) {
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const limit = Math.min(200, Math.max(1, Number.parseInt(query.limit, 10) || 50));
  const order = String(query.order || 'asc').toLowerCase() === 'desc' ? -1 : 1;
  return { page, limit, order, sortBy: String(query.sortBy || 'participantId') };
}
function pagination(total, page, limit) {
  const pages = Math.ceil(total / limit);
  return { total, page, pageSize: limit, totalPages: pages, hasNextPage: page < pages, hasPreviousPage: page > 1 };
}
const regex = (s) => new RegExp(String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
const participant = (id) => M.Participant.findOne({ participantId: id, active: { $ne: false } });

participantContingent.post('/participants/import/preview', requirePerm('participants:write'), ah(async (req, res) => {
  const type = req.body?.type || 'participant';
  if (!['participant', 'contingent'].includes(type)) throw badRequest('type must be participant or contingent');
  if (typeof req.body?.csv !== 'string' || req.body.csv.length > 5_000_000) throw badRequest('csv must be a string no larger than 5 MB');
  let sourceRows;
  try { sourceRows = parseCsv(req.body.csv, { columns: true, skip_empty_lines: true, bom: true, trim: true }); }
  catch (e) { throw badRequest('CSV could not be parsed', { message: e.message }); }
  const rows = sourceRows.map((source, index) => {
    const { data, error } = mapImportRow(source, req.body.mapping, type);
    return { rowNumber: index + 2, source, data: data || null, status: error ? 'rejected' : 'ready', errors: error ? [error] : [] };
  });
  const batchId = `IMP-${crypto.randomUUID()}`;
  const summary = { type, total: rows.length, ready: rows.filter((r) => r.status === 'ready').length, rejected: rows.filter((r) => r.status === 'rejected').length };
  await M.ParticipantImportBatch.create({ batchId, mapping: { type, fields: req.body.mapping || {} }, rows, summary, createdBy: req.user.userId });
  res.status(201).json({ batchId, summary, rows: rows.map(({ rowNumber, status, errors, data }) => ({ rowNumber, status, errors, data })) });
}));
participantContingent.post('/participants/import/:batchId/confirm', requirePerm('participants:write'), ah(async (req, res) => {
  const batch = await M.ParticipantImportBatch.findOne({ batchId: req.params.batchId });
  if (!batch) throw notFound('No such import batch');
  if (batch.status === 'confirmed') return res.json({ batchId: batch.batchId, status: 'confirmed', summary: batch.summary, idempotent: true });
  const type = batch.mapping?.type || 'participant';
  const issues = [];
  let imported = 0;
  for (const row of batch.rows) {
    if (row.status !== 'ready' || !row.data) continue;
    const data = row.data;
    if (type === 'participant') {
      if (data.contingentId && !await M.Contingent.exists({ contingentId: data.contingentId })) { row.status = 'rejected'; row.errors = ['contingentId does not match an existing contingent']; continue; }
      const exists = await M.Participant.findOne({ $or: [{ participantId: data.participantId }, ...(data.email ? [{ email: String(data.email).toLowerCase() }] : [])] }).lean();
      if (exists) { row.status = 'rejected'; row.errors = ['Existing participant conflict; existing verified records are never overwritten']; issues.push({ rowNumber: row.rowNumber, code: 'existing_record_conflict' }); continue; }
      data.email = data.email ? String(data.email).toLowerCase() : undefined;
      data.source = 'csv_import'; data.sourceRowId = String(row.rowNumber);
      await M.Participant.create(data);
    } else {
      if (data.collegeCode) data.collegeCode = String(data.collegeCode).toUpperCase().replace(/\s+/g, '');
      if (await M.Contingent.exists({ $or: [{ contingentId: data.contingentId }, ...(data.collegeCode ? [{ collegeCode: data.collegeCode }] : [])] })) { row.status = 'rejected'; row.errors = ['Existing contingent conflict']; continue; }
      await M.Contingent.create(data);
    }
    row.status = 'imported'; imported++;
  }
  batch.status = 'confirmed'; batch.confirmedBy = req.user.userId; batch.confirmedAt = new Date();
  batch.summary = { ...(batch.summary?.toObject ? batch.summary.toObject() : batch.summary), imported, rejected: batch.rows.filter((r) => r.status === 'rejected').length };
  batch.markModified('rows'); await batch.save();
  await appendAudit({ actor: { userId: req.user.userId, email: req.user.email, role: req.user.role }, action: 'PARTICIPANT_CSV_IMPORT_CONFIRMED', entity: { type: 'ParticipantImportBatch', id: batch.batchId }, risk: 'low', summary: batch.summary });
  res.json({ batchId: batch.batchId, status: batch.status, summary: batch.summary, issues, rejectedRows: batch.rows.filter((r) => r.status === 'rejected').map((r) => ({ rowNumber: r.rowNumber, errors: r.errors })) });
}));

// Static participant routes must precede /:id.
participantContingent.get('/participants/duplicates', requirePerm('dataquality:read'), ah(async (_req, res) => {
  const records = await M.Participant.find({ active: { $ne: false } }).select('+contact').limit(10000).lean();
  const pairs = new Map();
  const norm = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
  const phone = (s) => String(s || '').replace(/\D/g, '').slice(-10);
  const buckets = new Map();
  for (const p of records) {
    const name = norm(p.name || `${p.firstName || ''} ${p.lastName || ''}`), college = norm(p.college), tel = phone(p.contact);
    const keys = [norm(p.email) && [`email:${norm(p.email)}`, 'exact_email'], tel && [`phone:${tel}`, 'exact_phone'], p.participantId && [`code:${p.participantId}`, 'exact_participant_code'], name && college && [`nameCollege:${name}|${college}`, 'same_name_and_college']].filter(Boolean);
    for (const [key, reason] of keys) {
      const bucket = buckets.get(key) || [];
      for (const other of bucket) {
        const ids = [other.participantId, p.participantId].sort(), pairKey = ids.join('|');
        const pair = pairs.get(pairKey) || { participants: ids, matched: [] };
        if (!pair.matched.includes(reason)) pair.matched.push(reason);
        pairs.set(pairKey, pair);
      }
      bucket.push(p); buckets.set(key, bucket);
    }
  }
  for (const pair of pairs.values()) { const exact = pair.matched.some((m) => m.startsWith('exact_')); pair.classification = exact ? 'likely_duplicate' : 'possible_duplicate'; pair.confidence = exact ? 0.98 : 0.75; }
  res.json({ candidates: [...pairs.values()] });
}));
participantContingent.get('/participants/incomplete', requirePerm('dataquality:read'), ah(async (req, res) => {
  const { page, limit } = pageArgs(req.query);
  const rows = await M.Participant.find({ active: { $ne: false } }).sort({ participantId: 1 }).lean();
  const incomplete = rows.map((p) => ({ participant: maskParticipant(p, req.user.role), ...issuesFor(p) })).filter((x) => x.issues.length);
  res.json({ records: incomplete.slice((page - 1) * limit, page * limit), ...pagination(incomplete.length, page, limit) });
}));

participantContingent.get('/participants', requirePerm('participants:read'), ah(async (req, res) => {
  const q = {};
  if (req.query.archived !== 'true') q.active = { $ne: false };
  if (req.query.contingent) q.contingentId = String(req.query.contingent);
  if (req.query.college) q.college = regex(req.query.college);
  if (req.query.status) q.recordStatus = req.query.status;
  if (req.query.dietary) q['dietaryNeeds.needs'] = req.query.dietary;
  if (req.query.accessibility === 'true') q['accessibilityNeeds.needs.0'] = { $exists: true };
  if (req.query.accommodation != null) q.accommodationRequested = String(req.query.accommodation) === 'true';
  if (req.query.arrivalFrom || req.query.arrivalTo) q.arrivalDateTime = { ...(req.query.arrivalFrom ? { $gte: new Date(req.query.arrivalFrom) } : {}), ...(req.query.arrivalTo ? { $lte: new Date(req.query.arrivalTo) } : {}) };
  if (req.query.departureFrom || req.query.departureTo) q.departureDateTime = { ...(req.query.departureFrom ? { $gte: new Date(req.query.departureFrom) } : {}), ...(req.query.departureTo ? { $lte: new Date(req.query.departureTo) } : {}) };
  if (req.query.q) { const r = regex(req.query.q); q.$or = [{ name: r }, { firstName: r }, { lastName: r }, { email: r }, { contact: r }, { participantId: r }]; }
  const { page, limit, sortBy, order } = pageArgs(req.query);
  const allowedSort = new Set(['participantId', 'name', 'college', 'createdAt', 'arrivalDateTime']);
  const sort = { [allowedSort.has(sortBy) ? sortBy : 'participantId']: order };
  const [rows, total] = await Promise.all([M.Participant.find(q).select('+contact').sort(sort).skip((page - 1) * limit).limit(limit).lean(), M.Participant.countDocuments(q)]);
  res.json({ ...pagination(total, page, limit), rows: rows.map((p) => maskParticipant(p, req.user.role)) });
}));
participantContingent.post('/participants', requirePerm('participants:write'), ah(async (req, res) => {
  const data = pick(req.body, participantWriteFields);
  if (!data.participantId) throw badRequest('participantId is required');
  if (!data.name && (data.firstName || data.lastName)) data.name = [data.firstName, data.lastName].filter(Boolean).join(' ');
  if (data.email) { data.email = data.email.toLowerCase(); if (!emailRx.test(data.email)) throw badRequest('email is invalid'); }
  if (data.contingentId && !await M.Contingent.exists({ contingentId: data.contingentId })) throw badRequest('contingentId does not match an existing contingent');
  parseDates(data);
  const reason = req.body?.reason;
  const out = await runCommand({ user: req.user, action: 'PARTICIPANT_CREATED', entity: { type: 'Participant', id: data.participantId }, event: 'participant.created' }, async (session) => {
    const [created] = await M.Participant.create([data], session ? { session } : {});
    return { summary: { participantId: data.participantId, fields: Object.keys(data) }, result: { participant: maskParticipant(created.toObject(), req.user.role), ...issuesFor(created.toObject()) } };
  });
  res.status(201).json(out);
}));
participantContingent.get('/participants/:id/events', requirePerm('participants:read'), ah(async (req, res) => {
  if (!await participant(req.params.id)) throw notFound('No such participant');
  const registrations = await M.Registration.find({ participantId: req.params.id }).select('eventId teamId active').lean();
  res.json({ participantId: req.params.id, registrations });
}));
participantContingent.get('/participants/:id/accommodation', requirePerm('accommodation:read'), ah(async (req, res) => {
  if (!await participant(req.params.id)) throw notFound('No such participant');
  const allocations = await M.Allocation.find({ participantId: req.params.id }).sort({ createdAt: -1 }).lean();
  res.json({ participantId: req.params.id, allocations });
}));
participantContingent.get('/participants/:id/history', requirePerm('dataquality:read'), ah(async (req, res) => {
  const id = String(req.params.id);
  const history = await M.AuditLog.find({ 'entity.id': id, 'entity.type': 'Participant' }).sort({ seq: -1 }).limit(100).lean();
  res.json({ participantId: id, history });
}));
participantContingent.patch('/participants/:id/verify', requirePerm('participants:write'), ah(async (req, res) => {
  if (!await participant(req.params.id)) throw notFound('No such participant');
  const out = await runCommand({ user: req.user, action: 'PARTICIPANT_VERIFIED', entity: { type: 'Participant', id: req.params.id }, event: 'participant.verified' }, async (session) => {
    const p = await M.Participant.findOneAndUpdate({ participantId: req.params.id }, { recordStatus: 'verified' }, { new: true, runValidators: true, session }).lean();
    return { summary: { participantId: req.params.id }, result: { participant: maskParticipant(p, req.user.role) } };
  });
  res.json(out);
}));
participantContingent.patch('/participants/:id/archive', requirePerm('participants:write'), ah(async (req, res) => {
  const out = await runCommand({ user: req.user, action: 'PARTICIPANT_ARCHIVED', entity: { type: 'Participant', id: req.params.id }, event: 'participant.archived' }, async (session) => {
    const p = await M.Participant.findOneAndUpdate({ participantId: req.params.id, active: { $ne: false } }, { active: false }, { new: true, session }).lean();
    if (!p) throw notFound('No such active participant');
    return { summary: { participantId: req.params.id }, result: { participantId: req.params.id, active: false } };
  });
  res.json(out);
}));
participantContingent.put('/participants/:id', requirePerm('participants:write'), ah(async (req, res) => {
  const data = pick(req.body, participantWriteFields); delete data.participantId;
  if (data.email) { data.email = data.email.toLowerCase(); if (!emailRx.test(data.email)) throw badRequest('email is invalid'); }
  parseDates(data);
  if (data.contingentId && !await M.Contingent.exists({ contingentId: data.contingentId })) throw badRequest('contingentId does not match an existing contingent');
  const out = await runCommand({ user: req.user, action: 'PARTICIPANT_UPDATED', entity: { type: 'Participant', id: req.params.id }, event: 'participant.updated' }, async (session) => {
    const p = await M.Participant.findOneAndUpdate({ participantId: req.params.id, active: { $ne: false } }, { $set: data }, { new: true, runValidators: true, session }).select('+contact').lean();
    if (!p) throw notFound('No such active participant');
    return { summary: { participantId: req.params.id, fields: Object.keys(data) }, result: { participant: maskParticipant(p, req.user.role), ...issuesFor(p) } };
  });
  res.json(out);
}));
participantContingent.delete('/participants/:id', requirePerm('participants:write'), ah(async (req, res) => {
  const out = await runCommand({ user: req.user, action: 'PARTICIPANT_ARCHIVED', entity: { type: 'Participant', id: req.params.id }, event: 'participant.archived' }, async (session) => {
    const p = await M.Participant.findOneAndUpdate({ participantId: req.params.id, active: { $ne: false } }, { active: false }, { new: true, session }).lean();
    if (!p) throw notFound('No such active participant');
    return { summary: { participantId: req.params.id }, result: { participantId: req.params.id, active: false, archived: true } };
  }); res.json(out);
}));

// Contingent management: all counts are computed from participant records.
participantContingent.get('/contingents', requirePerm('contingents:read'), ah(async (req, res) => {
  const q = {};
  if (req.query.q) { const r = regex(req.query.q); q.$or = [{ contingentId: r }, { college: r }, { collegeCode: r }]; }
  const { page, limit, sortBy, order } = pageArgs(req.query);
  const sortKey = ['contingentId', 'college', 'status', 'createdAt'].includes(sortBy) ? sortBy : 'contingentId';
  const [rows, total] = await Promise.all([M.Contingent.find(q).sort({ [sortKey]: order }).skip((page - 1) * limit).limit(limit).lean(), M.Contingent.countDocuments(q)]);
  const ids = rows.map((r) => r.contingentId);
  const counts = await M.Participant.aggregate([{ $match: { contingentId: { $in: ids }, personType: 'participant', active: { $ne: false } } }, { $group: { _id: '$contingentId', count: { $sum: 1 } } }]);
  const byId = new Map(counts.map((c) => [c._id, c.count]));
  res.json({ ...pagination(total, page, limit), rows: rows.map((c) => ({ ...c, participantCount: byId.get(c.contingentId) || 0 })) });
}));
participantContingent.post('/contingents', requirePerm('contingents:write'), ah(async (req, res) => {
  const data = pick(req.body, contingentWriteFields);
  if (!data.contingentId || !data.college) throw badRequest('contingentId and college are required');
  if (data.strengthDeclared != null && (!Number.isInteger(Number(data.strengthDeclared)) || Number(data.strengthDeclared) < 0)) throw badRequest('strengthDeclared must be a non-negative integer');
  if (data.strengthDeclared != null) data.strengthDeclared = Number(data.strengthDeclared);
  if (data.contactEmail && !emailRx.test(data.contactEmail)) throw badRequest('contactEmail is invalid');
  if (data.collegeCode) data.collegeCode = data.collegeCode.toUpperCase().replace(/\s+/g, '');
  parseDates(data);
  if (data.collegeCode && await M.Contingent.exists({ collegeCode: data.collegeCode })) throw conflict('A contingent with this collegeCode already exists');
  const out = await runCommand({ user: req.user, action: 'CONTINGENT_CREATED', entity: { type: 'Contingent', id: data.contingentId }, event: 'contingent.created' }, async (session) => {
    const [c] = await M.Contingent.create([data], session ? { session } : {});
    return { summary: { contingentId: data.contingentId, college: data.college }, result: { contingent: { ...c.toObject(), participantCount: 0 } } };
  });
  res.status(201).json(out);
}));
participantContingent.get('/contingents/:id/participants', requirePerm('contingents:read'), ah(async (req, res) => {
  if (!await M.Contingent.exists({ contingentId: req.params.id })) throw notFound('No such contingent');
  const { page, limit } = pageArgs(req.query);
  const q = { contingentId: req.params.id, active: { $ne: false } };
  const [rows, total] = await Promise.all([M.Participant.find(q).sort({ participantId: 1 }).skip((page - 1) * limit).limit(limit).lean(), M.Participant.countDocuments(q)]);
  res.json({ ...pagination(total, page, limit), rows: rows.map((p) => maskParticipant(p, req.user.role)) });
}));
participantContingent.get('/contingents/:id/summary', requirePerm('contingents:read'), ah(async (req, res) => {
  const c = await M.Contingent.findOne({ contingentId: req.params.id }).lean(); if (!c) throw notFound('No such contingent');
  const [actualParticipantCount, arrivedCount, accommodationCount, recordStatuses] = await Promise.all([
    M.Participant.countDocuments({ contingentId: c.contingentId, personType: 'participant', active: { $ne: false } }),
    M.Participant.countDocuments({ contingentId: c.contingentId, checkInStatus: 'checked_in', active: { $ne: false } }),
    M.Participant.countDocuments({ contingentId: c.contingentId, accommodationRequested: true, active: { $ne: false } }),
    M.Participant.aggregate([{ $match: { contingentId: c.contingentId, active: { $ne: false } } }, { $group: { _id: '$recordStatus', count: { $sum: 1 } } }]),
  ]);
  res.json({ contingent: c, expectedCount: c.strengthDeclared || 0, actualParticipantCount, arrivedCount, accommodationCount, recordStatuses });
}));
participantContingent.patch('/contingents/:id/status', requirePerm('contingents:write'), ah(async (req, res) => {
  const allowed = ['expected', 'confirmed', 'arrived', 'partially_arrived', 'departed', 'cancelled'];
  if (!allowed.includes(req.body?.status)) throw badRequest(`status must be one of: ${allowed.join(', ')}`);
  const out = await runCommand({ user: req.user, action: 'CONTINGENT_STATUS_UPDATED', entity: { type: 'Contingent', id: req.params.id }, event: 'contingent.updated' }, async (session) => {
    const c = await M.Contingent.findOneAndUpdate({ contingentId: req.params.id }, { status: req.body.status }, { new: true, runValidators: true, session }).lean();
    if (!c) throw notFound('No such contingent');
    return { summary: { contingentId: c.contingentId, status: c.status }, result: { contingent: c } };
  }); res.json(out);
}));
participantContingent.put('/contingents/:id', requirePerm('contingents:write'), ah(async (req, res) => {
  const data = pick(req.body, contingentWriteFields); delete data.contingentId;
  if (data.strengthDeclared != null) { data.strengthDeclared = Number(data.strengthDeclared); if (!Number.isInteger(data.strengthDeclared) || data.strengthDeclared < 0) throw badRequest('strengthDeclared must be a non-negative integer'); }
  if (data.collegeCode) data.collegeCode = data.collegeCode.toUpperCase().replace(/\s+/g, '');
  parseDates(data);
  const out = await runCommand({ user: req.user, action: 'CONTINGENT_UPDATED', entity: { type: 'Contingent', id: req.params.id }, event: 'contingent.updated' }, async (session) => {
    const c = await M.Contingent.findOneAndUpdate({ contingentId: req.params.id }, { $set: data }, { new: true, runValidators: true, session }).lean();
    if (!c) throw notFound('No such contingent');
    return { summary: { contingentId: c.contingentId, fields: Object.keys(data) }, result: { contingent: c } };
  }); res.json(out);
}));
participantContingent.get('/contingents/:id', requirePerm('contingents:read'), ah(async (req, res) => {
  const c = await M.Contingent.findOne({ contingentId: req.params.id }).lean(); if (!c) throw notFound('No such contingent');
  const { page, limit } = pageArgs(req.query); const q = { contingentId: c.contingentId, active: { $ne: false } };
  const [rows, total, participantCount] = await Promise.all([M.Participant.find(q).sort({ participantId: 1 }).skip((page - 1) * limit).limit(limit).lean(), M.Participant.countDocuments(q), M.Participant.countDocuments({ ...q, personType: 'participant' })]);
  res.json({ contingent: { ...c, participantCount }, ...pagination(total, page, limit), participants: rows.map((p) => maskParticipant(p, req.user.role)) });
}));
participantContingent.delete('/contingents/:id', requirePerm('contingents:write'), ah(async (req, res) => {
  const activeCount = await M.Participant.countDocuments({ contingentId: req.params.id, active: { $ne: false } });
  if (activeCount) throw conflict('Cannot archive a contingent while it has active participants', { activeCount });
  const out = await runCommand({ user: req.user, action: 'CONTINGENT_ARCHIVED', entity: { type: 'Contingent', id: req.params.id }, event: 'contingent.updated' }, async (session) => {
    const c = await M.Contingent.findOneAndUpdate({ contingentId: req.params.id }, { status: 'cancelled' }, { new: true, session }).lean();
    if (!c) throw notFound('No such contingent');
    return { summary: { contingentId: c.contingentId }, result: { contingentId: c.contingentId, status: c.status, archived: true } };
  }); res.json(out);
}));

