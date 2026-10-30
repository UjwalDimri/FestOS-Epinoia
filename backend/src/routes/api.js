import express from 'express';
import bcrypt from 'bcryptjs';
import * as M from '../models/index.js';
import { ah, badRequest, notFound, forbidden } from '../utils/errors.js';
import { authenticate, requirePerm, signToken } from '../middleware/auth.js';
import { maskParticipant } from '../middleware/fieldMask.js';
import { can, ROLES, REVEALABLE } from '../shared/roles.js';
import { loadState, accommodationRun, scheduleRun, foodRun, activePlan } from '../services/state.js';
import { buildAccommodationPlan, buildSchedulePlan, activateAccommodationPlan, activateSchedulePlan } from '../services/plans.js';
import { previewDisruption, commitDisruption, DISRUPTION_TYPES } from '../services/disruptions.js';
import { issueMerch, replaceMerch, merchForecast } from '../services/merch.js';
import { runCommand, verifyAuditChain, appendAudit } from '../services/command.js';
import { computeAlerts } from '../services/alerts.js';
import { explain } from '../services/explain.js';
import { getAssumptions, invalidateAssumptions } from '../services/assumptions.js';
import { ensureDefaultPlans } from '../services/bootstrap.js';
import { checkRisk } from '../services/command.js';
import { parseIST, fmtIST, istDateKey, dateRangeKeys } from '../utils/time.js';
import { toCsv } from '../utils/csv.js';
import { findDuplicateCandidates } from '../import/dedupe.js';
import { env } from '../config/env.js';
import { participantContingent } from '../modules/participants/participantContingent.routes.js';
import { listStaff, createStaff, updateStaff, listShifts, createShift, listAssignments, createAssignment,
  listAvailability, createAvailability, listAttendance, recordAttendance } from '../services/staff.js';

export const api = express.Router();

function contingentView(contingent, participantCount) {
  return {
    ...contingent,
    participantCount,
    declaredDelta: participantCount - (contingent.strengthDeclared || 0),
  };
}

// ---------- auth
api.post('/auth/login', ah(async (req, res) => {
  if (env.authMode !== 'dev') throw badRequest('Password login is disabled in clerk mode');
  const { email, password } = req.body || {};
  const u = await M.User.findOne({ email: String(email || '').toLowerCase() }).select('+passwordHash').lean();
  if (!u || !(await bcrypt.compare(String(password || ''), u.passwordHash))) throw badRequest('Email or password is wrong');
  const user = { userId: String(u._id), email: u.email, role: u.role, name: u.name };
  res.json({ token: signToken(user), user: { ...user, roleLabel: ROLES[u.role] } });
}));

api.use(authenticate);
api.use(participantContingent);

api.get('/me', ah(async (req, res) => {
  res.json({ user: { ...req.user, roleLabel: ROLES[req.user.role] }, permissions: ['override:medium', 'participants:reveal'].filter((p) => can(req.user.role, p)) });
}));

api.post('/explain', ah(async (req, res) => {
  res.json(await explain(req.body?.reasonCodes || [], { kind: req.body?.kind || 'allocation' }));
}));

// ---------- dashboard / alerts
api.get('/dashboard', ah(async (req, res) => {
  const [alerts, people, plan, sp, merch, vendors] = await Promise.all([
    computeAlerts(), M.Participant.countDocuments({}), activePlan('accommodation'), activePlan('schedule'),
    merchForecast(), M.Vendor.find({}).lean(),
  ]);
  const state = await loadState();
  res.json({
    counts: { people, contingents: state.contingents.length, events: state.events.length, venues: state.venues.length, vendors: vendors.length,
      dataIssuesOpen: await M.DataIssue.countDocuments({ status: 'open' }), duplicatesOpen: await M.DuplicateCandidate.countDocuments({ status: 'open' }) },
    alerts,
    accommodation: plan ? { planId: plan.planId, strategy: plan.strategy, metrics: plan.metrics } : null,
    schedule: sp ? { planId: sp.planId, metrics: sp.metrics } : null,
    merchShort: merch.filter((m) => m.remaining <= 0).length,
  });
}));

api.get('/alerts', ah(async (req, res) => res.json({ alerts: await computeAlerts() })));
api.post('/alerts/:key/ack', requirePerm('alerts:ack'), ah(async (req, res) => {
  const a = await M.Alert.findOneAndUpdate({ key: req.params.key }, { status: 'acknowledged', acknowledgedBy: req.user.email, acknowledgedAt: new Date() }, { new: true }).lean();
  if (!a) throw notFound('No such alert');
  res.json({ alert: a });
}));

// ---------- participants (masked by role)
api.get('/participants', requirePerm('participants:read'), ah(async (req, res) => {
  const q = {};
  if (req.query.contingent) q.contingentId = String(req.query.contingent);
  if (req.query.housing) q.housingCategory = String(req.query.housing);
  if (req.query.q) q.name = new RegExp(String(req.query.q).replace(/[^\w\s]/g, ''), 'i');
  if (req.query.flag === 'minor') q.isMinor = true;
  if (req.query.flag === 'quarantined') q.quarantined = true;
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const page = Math.max(Number(req.query.page) || 1, 1);
  const [rows, total] = await Promise.all([
    M.Participant.find(q).sort({ participantId: 1 }).skip((page - 1) * limit).limit(limit).lean(),
    M.Participant.countDocuments(q),
  ]);
  res.json({ total, page, limit, rows: rows.map((r) => maskParticipant(r, req.user.role)) });
}));

api.post('/participants', requirePerm('participants:write'), ah(async (req, res) => {
  const body = req.body || {};
  const participantId = String(body.participantId || '').trim();
  const name = String(body.name || '').trim();
  const contingentId = String(body.contingentId || '').trim();
  if (!participantId || !name || !contingentId) {
    throw badRequest('participantId, name and contingentId are required');
  }
  const contingent = await M.Contingent.findOne({ contingentId }).lean();
  if (!contingent) throw badRequest(`Unknown contingentId: ${contingentId}`);
  const age = body.age == null || body.age === '' ? undefined : Number(body.age);
  if (age !== undefined && (!Number.isFinite(age) || age < 0 || age > 120)) {
    throw badRequest('age must be a number from 0 to 120');
  }
  const personType = body.personType || 'participant';
  if (!['participant', 'escort', 'leader'].includes(personType)) throw badRequest('personType must be participant, escort or leader');
  const housingCategory = body.housingCategory || 'unconfirmed';
  if (!['female', 'male', 'all_gender', 'unconfirmed'].includes(housingCategory)) throw badRequest('housingCategory must be female, male, all_gender or unconfirmed');
  const checkInStatus = body.checkInStatus || 'expected';
  if (!['expected', 'checked_in', 'delayed', 'absent'].includes(checkInStatus)) throw badRequest('checkInStatus must be expected, checked_in, delayed or absent');
  if (body.isMinor != null && typeof body.isMinor !== 'boolean') throw badRequest('isMinor must be true or false');
  if (body.accommodationRequested != null && typeof body.accommodationRequested !== 'boolean') throw badRequest('accommodationRequested must be true or false');
  const arrivalDateTime = body.arrivalDateTime || body.arrival ? new Date(body.arrivalDateTime || body.arrival) : undefined;
  const departureDateTime = body.departureDateTime || body.departure ? new Date(body.departureDateTime || body.departure) : undefined;
  if ((arrivalDateTime && Number.isNaN(arrivalDateTime.getTime())) || (departureDateTime && Number.isNaN(departureDateTime.getTime()))) {
    throw badRequest('arrivalDateTime and departureDateTime must be valid dates');
  }
  if (arrivalDateTime && departureDateTime && departureDateTime <= arrivalDateTime) throw badRequest('departureDateTime must be after arrivalDateTime');
  const participant = {
    participantId, name, contingentId, college: body.college || contingent.college,
    personType, isLeader: body.isLeader === true || personType === 'leader',
    gender: body.gender ?? body.genderAsGiven ?? null,
    housingCategory,
    age, isMinor: body.isMinor == null ? (age != null && age < 18) : body.isMinor,
    contact: body.contact || '',
    accessibilityNeeds: body.accessibilityNeeds || body.accessibility || { status: 'not_declared', needs: [] },
    dietaryNeeds: body.dietaryNeeds || body.dietary || { status: 'unknown', needs: [] },
    arrivalDateTime, departureDateTime,
    accommodationRequested: body.accommodationRequested ?? true,
    tshirtSize: body.tshirtSize || undefined,
    checkInStatus,
    quarantined: false, active: true,
  };
  const out = await runCommand({ user: req.user, action: 'PARTICIPANT_CREATED', entity: { type: 'Participant', id: participantId }, risk: 'low', event: 'participant.created' }, async (session) => {
    const [created] = await M.Participant.create([participant], session ? { session } : {});
    return { summary: { participantId, contingentId }, result: { participant: maskParticipant(created.toObject(), req.user.role) } };
  });
  res.status(201).json(out);
}));

api.get('/participants/:id', requirePerm('participants:read'), ah(async (req, res) => {
  const p = await M.Participant.findOne({ participantId: req.params.id }).lean();
  if (!p) throw notFound('No such participant');
  const [regs, alloc, merch, plan, issues] = await Promise.all([
    M.Registration.find({ participantId: p.participantId }).lean(),
    M.Allocation.findOne({ participantId: p.participantId, status: { $ne: 'released' } }).sort({ createdAt: -1 }).lean(),
    M.MerchIssue.find({ participantId: p.participantId }).lean(),
    activePlan('accommodation'),
    M.DataIssue.find({ 'entity.id': p.participantId, status: 'open' }).lean(),
  ]);
  const dupes = await M.DuplicateCandidate.find({ $or: [{ a: p.participantId }, { b: p.participantId }], status: 'open' }).lean();
  let room = null;
  if (alloc?.bed?.roomId) room = await M.Room.findOne({ roomId: alloc.bed.roomId }).lean();
  let explanation = null;
  if (alloc) explanation = (await explain(alloc.reasonCodes || [], { kind: 'allocation' })).text;
  res.json({
    person: maskParticipant({ ...p, issues }, req.user.role),
    registrations: regs.map((r) => r.eventId),
    allocation: alloc ? { ...alloc, roomStatus: room?.status || null, explanation } : null,
    merch: merch.map((m) => ({ item: m.item, size: m.size, kind: m.kind, desk: m.desk, issuedAt: m.issuedAt })),
    duplicateCandidates: dupes.map((d) => ({ other: d.a === p.participantId ? d.b : d.a, score: d.score, status: d.status })),
    planId: plan?.planId || null,
  });
}));

// ---------- contingents
api.get('/contingents', requirePerm('contingents:read'), ah(async (req, res) => {
  const q = {};
  if (req.query.q) {
    const term = String(req.query.q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    q.$or = [{ contingentId: new RegExp(term, 'i') }, { college: new RegExp(term, 'i') }];
  }
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const page = Math.max(Number(req.query.page) || 1, 1);
  const [contingents, totals] = await Promise.all([
    M.Contingent.find(q).sort({ contingentId: 1 }).skip((page - 1) * limit).limit(limit).lean(),
    M.Contingent.countDocuments(q),
  ]);
  const ids = contingents.map((c) => c.contingentId);
  const counts = await M.Participant.aggregate([
    { $match: { contingentId: { $in: ids }, personType: 'participant', active: true } },
    { $group: { _id: '$contingentId', count: { $sum: 1 } } },
  ]);
  const countByContingent = new Map(counts.map((x) => [x._id, x.count]));
  res.json({
    total: totals, page, limit,
    rows: contingents.map((c) => {
      const participantCount = countByContingent.get(c.contingentId) || 0;
      return contingentView(c, participantCount);
    }),
  });
}));

api.post('/contingents', requirePerm('contingents:write'), ah(async (req, res) => {
  const body = req.body || {};
  const contingentId = String(body.contingentId || body.name || '').trim();
  const college = String(body.college || body.institution || '').trim();
  if (!contingentId || !college) throw badRequest('contingentId (or name) and college (or institution) are required');
  const strengthDeclared = body.strengthDeclared == null ? 0 : Number(body.strengthDeclared);
  if (!Number.isInteger(strengthDeclared) || strengthDeclared < 0) throw badRequest('strengthDeclared must be a non-negative integer');
  const contingent = {
    contingentId, college, strengthDeclared,
    leader: body.leader || body.leaderName || body.contactPerson || '',
    leaderParticipantId: body.leaderParticipantId || null,
    escort: body.escort || body.escortName || '', escortPersonId: body.escortPersonId || null,
    preferencesRaw: body.preferencesRaw || '',
    preferences: Array.isArray(body.preferences) ? body.preferences : [],
  };
  const out = await runCommand({ user: req.user, action: 'CONTINGENT_CREATED', entity: { type: 'Contingent', id: contingentId }, risk: 'low', event: 'contingent.created' }, async (session) => {
    const [created] = await M.Contingent.create([contingent], session ? { session } : {});
    return { summary: { contingentId, college }, result: { contingent: contingentView(created.toObject(), 0) } };
  });
  res.status(201).json(out);
}));

api.get('/contingents/:id', requirePerm('contingents:read'), ah(async (req, res) => {
  const contingent = await M.Contingent.findOne({ contingentId: req.params.id }).lean();
  if (!contingent) throw notFound('No such contingent');
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const page = Math.max(Number(req.query.page) || 1, 1);
  const q = { contingentId: contingent.contingentId, active: true };
  const [people, memberCount, participantCount] = await Promise.all([
    M.Participant.find(q).sort({ participantId: 1 }).skip((page - 1) * limit).limit(limit).lean(),
    M.Participant.countDocuments(q),
    M.Participant.countDocuments({ ...q, personType: 'participant' }),
  ]);
  res.json({
    contingent: contingentView(contingent, participantCount),
    total: memberCount, page, limit,
    participants: people.map((p) => maskParticipant(p, req.user.role)),
  });
}));

api.post('/participants/:id/reveal', ah(async (req, res) => {
  const { field, reason } = req.body || {};
  const canonicalField = ({ accessibility: 'accessibilityNeeds', dietary: 'dietaryNeeds' })[field] || field;
  if (!REVEALABLE[canonicalField]) throw badRequest(`Field "${field}" cannot be revealed`, { allowed: Object.keys(REVEALABLE) });
  if (!REVEALABLE[canonicalField].includes(req.user.role)) throw forbidden(`Your role cannot reveal ${canonicalField}`);
  if (!reason || reason.trim().length < 5) throw badRequest('Give a reason (at least 5 characters). Every reveal is logged.');
  const p = await M.Participant.findOne({ participantId: req.params.id }).select('+contact').lean();
  if (!p) throw notFound('No such participant');
  await appendAudit({ actor: { userId: req.user.userId, email: req.user.email, role: req.user.role }, action: 'SENSITIVE_REVEAL', entity: { type: 'Participant', id: p.participantId }, reason, risk: 'low', summary: { field: canonicalField } });
  const value = canonicalField === 'contact' ? p.contact : canonicalField === 'accessibilityNeeds' ? p.accessibilityNeeds : p.dietaryNeeds;
  res.json({ participantId: p.participantId, field: canonicalField, value });
}));

api.post('/participants/:id/housing', requirePerm('participants:write'), ah(async (req, res) => {
  const { housingCategory, reason } = req.body || {};
  if (!['female', 'male', 'all_gender'].includes(housingCategory)) throw badRequest('housingCategory must be female, male or all_gender');
  return res.json(await runCommand({ user: req.user, action: 'HOUSING_CONFIRMED', entity: { type: 'Participant', id: req.params.id }, reason, risk: 'medium', event: 'participant.housing' },
    async (session) => {
      const p = await M.Participant.findOneAndUpdate({ participantId: req.params.id }, { housingCategory, housingConfirmedBy: req.user.email }, { new: true, session }).lean();
      if (!p) throw notFound('No such participant');
      return { summary: { participantId: p.participantId, housingCategory }, result: { participantId: p.participantId, housingCategory } };
    }));
}));

// ---------- data quality
api.get('/data/issues', requirePerm('dataquality:read'), ah(async (req, res) => {
  const q = {};
  if (req.query.severity) q.severity = req.query.severity;
  if (req.query.status) q.status = req.query.status; else q.status = 'open';
  res.json({ issues: await M.DataIssue.find(q).sort({ severity: -1, code: 1 }).limit(500).lean() });
}));

api.get('/data/headcount', requirePerm('dataquality:read'), ah(async (req, res) => {
  const state = await loadState();
  const A = state.assumptions;
  const raw = state.people.filter((p) => p.personType === 'participant').length;
  const quarantined = state.people.filter((p) => p.quarantined).length;
  const declared = state.contingents.reduce((s, c) => s + c.strengthDeclared, 0);
  const escorts = state.people.filter((p) => p.personType === 'escort').length;
  const confirmedDupes = await M.DuplicateCandidate.countDocuments({ status: 'merged' });
  res.json({
    ladder: [
      { step: 'Narrative estimate', value: A.narrativeExpectedParticipants },
      { step: 'Declared by contingents', value: declared },
      { step: 'Raw participant records', value: raw },
      { step: 'Quarantined (timing)', value: -quarantined },
      { step: 'Confirmed duplicates merged', value: -confirmedDupes },
      { step: 'Escorts added (not in participants.csv)', value: escorts },
    ],
    contingents: state.contingents.map((c) => {
      const n = state.people.filter((p) => p.contingentId === c.contingentId && p.personType === 'participant').length;
      return { contingentId: c.contingentId, college: c.college, declared: c.strengthDeclared, records: n, delta: n - c.strengthDeclared };
    }),
  });
}));

api.get('/data/duplicates', requirePerm('dataquality:read'), ah(async (req, res) => {
  res.json({ candidates: await M.DuplicateCandidate.find({ status: 'open' }).sort({ score: -1 }).limit(200).lean() });
}));

api.post('/data/duplicates/:id/dismiss', requirePerm('dataquality:write'), ah(async (req, res) => {
  const { reason } = req.body || {};
  return res.json(await runCommand({ user: req.user, action: 'DUPLICATE_DISMISSED', entity: { type: 'DuplicateCandidate', id: req.params.id }, reason, risk: 'low', event: 'duplicate.dismissed' },
    async () => {
      const d = await M.DuplicateCandidate.findByIdAndUpdate(req.params.id, { status: 'dismissed', 'resolution.by': req.user.email, 'resolution.reason': reason, 'resolution.at': new Date() }, { new: true }).lean();
      if (!d) throw notFound('No such candidate');
      return { summary: { dismissed: d.a + ' / ' + d.b }, result: d };
    }));
}));

api.post('/data/issues/:id/resolve', requirePerm('dataquality:write'), ah(async (req, res) => {
  const { reason, accept } = req.body || {};
  return res.json(await runCommand({ user: req.user, action: 'DATA_ISSUE_RESOLVED', entity: { type: 'DataIssue', id: req.params.id }, reason, risk: accept ? 'medium' : 'low', event: 'data.resolved' },
    async () => {
      const d = await M.DataIssue.findByIdAndUpdate(req.params.id, { status: accept ? 'accepted' : 'resolved', resolution: { by: req.user.email, reason, at: new Date() } }, { new: true }).lean();
      if (!d) throw notFound('No such issue');
      return { summary: { code: d.code }, result: d };
    }));
}));

// ---------- staff, shifts, duties, availability and attendance
api.get('/staff/departments', requirePerm('staff:read'), ah(async (_req, res) => {
  res.json({ departments: ['leadership', 'registration', 'hospitality', 'events', 'logistics', 'merchandise', 'food', 'volunteer'], roles: Object.entries(ROLES).map(([role, label]) => ({ role, label })) });
}));

api.get('/staff', requirePerm('staff:read'), ah(async (req, res) => res.json(await listStaff({ user: req.user, query: req.query }))));
api.post('/staff', requirePerm('staff:write'), ah(async (req, res) => res.status(201).json({ staff: await createStaff({ user: req.user, body: req.body || {} }) })));
api.put('/staff/:memberId', requirePerm('staff:write'), ah(async (req, res) => res.json({ staff: await updateStaff({ user: req.user, memberId: req.params.memberId, body: req.body || {} }) })));

api.get('/staff/shifts', requirePerm('staff:read'), ah(async (req, res) => res.json(await listShifts({ user: req.user, query: req.query }))));
api.post('/staff/shifts', requirePerm('staff:manage'), ah(async (req, res) => res.status(201).json({ shift: await createShift({ user: req.user, body: req.body || {} }) })));
api.get('/staff/assignments', requirePerm('staff:read'), ah(async (req, res) => res.json(await listAssignments({ user: req.user, query: req.query }))));
api.post('/staff/assignments', requirePerm('staff:manage'), ah(async (req, res) => res.status(201).json({ assignment: await createAssignment({ user: req.user, body: req.body || {} }) })));

api.get('/staff/availability', requirePerm('staff:read'), ah(async (req, res) => res.json(await listAvailability({ user: req.user, query: req.query }))));
api.post('/staff/availability', requirePerm('staff:manage'), ah(async (req, res) => res.status(201).json({ availability: await createAvailability({ user: req.user, body: req.body || {} }) })));
api.get('/staff/attendance', requirePerm('staff:read'), ah(async (req, res) => res.json(await listAttendance({ user: req.user, query: req.query }))));
api.post('/staff/attendance/check-in', requirePerm('staff:attendance'), ah(async (req, res) => res.json(await recordAttendance({ user: req.user, shiftId: req.body?.shiftId, memberId: req.body?.memberId, action: 'check-in' }))));
api.post('/staff/attendance/check-out', requirePerm('staff:attendance'), ah(async (req, res) => res.json(await recordAttendance({ user: req.user, shiftId: req.body?.shiftId, memberId: req.body?.memberId, action: 'check-out' }))));

// ---------- plans and accommodation
api.get('/plans', ah(async (req, res) => res.json({ plans: await M.Plan.find({}).sort({ createdAt: -1 }).lean() })));

api.post('/plans/accommodation', requirePerm('accommodation:write'), ah(async (req, res) => {
  const { strategy = 'balanced', budgetMode = 'respect' } = req.body || {};
  if (!['cost_first', 'cohesion_first', 'balanced'].includes(strategy)) throw badRequest('Unknown strategy');
  res.json(await buildAccommodationPlan({ user: req.user, strategy, budgetMode }));
}));

api.post('/plans/:planId/activate', requirePerm('accommodation:write'), ah(async (req, res) => {
  const plan = await M.Plan.findOne({ planId: req.params.planId }).lean();
  if (!plan) throw notFound('No such plan');
  const fn = plan.type === 'accommodation' ? activateAccommodationPlan : activateSchedulePlan;
  res.json(await fn({ user: req.user, planId: plan.planId, reason: req.body?.reason || 'Activated' }));
}));

api.get('/accommodation/compare', requirePerm('accommodation:read'), ah(async (req, res) => {
  const state = await loadState();
  const out = {};
  for (const s of ['cost_first', 'cohesion_first', 'balanced']) {
    const m = accommodationRun(state, { strategy: s }).metrics;
    out[s] = { placed: m.placed, unplaced: m.unplaced, externalCostINR: m.externalCostINR, overBudget: m.overBudget, splits: m.splits, contingentsSplit: m.contingentsSplit, unplacedByReason: m.unplacedByReason };
  }
  res.json({ strategies: out, note: 'Live runs on current data. Activate a plan to commit it.' });
}));

api.get('/accommodation/active', requirePerm('accommodation:read'), ah(async (req, res) => {
  const plan = await activePlan('accommodation');
  if (!plan) return res.json({ plan: null, allocations: [] });
  const allocations = await M.Allocation.find({ planId: plan.planId, status: { $ne: 'released' } }).sort({ participantId: 1 }).lean();
  const people = await M.Participant.find({ participantId: { $in: allocations.map((a) => a.participantId) } }).select('name').lean();
  const nameOf = new Map(people.map((p) => [p.participantId, p.name]));
  const rows = allocations.map((a) => ({ ...a, name: req.user.role === 'hospitality' || req.user.role === 'festival_director' ? nameOf.get(a.participantId) : undefined }));
  res.json({ plan: { planId: plan.planId, strategy: plan.strategy, metrics: plan.metrics, status: plan.status }, allocations: rows });
}));

api.get('/accommodation/unplaced', requirePerm('accommodation:read'), ah(async (req, res) => {
  const plan = await activePlan('accommodation');
  if (!plan) return res.json({ rows: [] });
  res.json({ rows: await M.Allocation.find({ planId: plan.planId, status: 'unplaced' }).sort({ participantId: 1 }).lean() });
}));

api.get('/rooms', requirePerm('accommodation:read'), ah(async (req, res) => {
  const rooms = await M.Room.find({}).sort({ roomId: 1 }).lean();
  res.json({ rooms });
}));

// ---------- schedule
api.post('/plans/schedule', requirePerm('schedule:write'), ah(async (req, res) => {
  res.json(await buildSchedulePlan({ user: req.user }));
}));

api.get('/schedule/active', requirePerm('schedule:read'), ah(async (req, res) => {
  const plan = await activePlan('schedule');
  if (!plan) return res.json({ plan: null, slots: [] });
  const slots = await M.Slot.find({ planId: plan.planId }).sort({ start: 1, slotId: 1 }).select('-participantIds').lean();
  const venues = await M.Venue.find({}).lean();
  res.json({ plan: { planId: plan.planId, metrics: plan.metrics }, slots, venues: venues.map((v) => ({ venueId: v.venueId, name: v.name, capacity: v.capacity, indoorOutdoor: v.indoorOutdoor })) });
}));

// ---------- inventory and merch
api.get('/inventory', requirePerm('inventory:read'), ah(async (req, res) => {
  const [balances, lines, movements] = await Promise.all([
    M.StockBalance.find({}).sort({ item: 1, location: 1 }).lean(),
    M.InventoryLine.find({}).lean(),
    M.StockMovement.find({}).sort({ at: -1 }).limit(50).lean(),
  ]);
  res.json({ balances, lines, movements });
}));

api.post('/inventory/move', requirePerm('inventory:write'), ah(async (req, res) => {
  const { item, from, to, qty, reason } = req.body || {};
  const n = Number(qty);
  if (!item || !from || !to || !(n > 0)) throw badRequest('item, from, to and qty are required');
  return res.json(await runCommand({ user: req.user, action: 'STOCK_MOVE', entity: { type: 'StockBalance', id: item }, reason, risk: 'low', event: 'stock.moved' },
    async (session) => {
      const src = await M.StockBalance.findOne({ item, location: from.location, state: from.state }).session(session);
      if (!src || src.qty < n) throw badRequest(`Only ${src?.qty || 0} ${item} ${from.state} at ${from.location}`);
      src.qty -= n; await src.save({ session });
      await M.StockBalance.updateOne({ item, location: to.location, state: to.state }, { $inc: { qty: n } }, { upsert: true, session });
      await M.StockMovement.create([{ item, qty: n, from, to, by: req.user.email, reason }], { session });
      return { summary: { item, qty: n, from, to }, result: { moved: n } };
    }));
}));

api.get('/merch', requirePerm('merch:read'), ah(async (req, res) => {
  res.json({ forecast: await merchForecast(), issuesToday: await M.MerchIssue.countDocuments({}) });
}));

api.post('/merch/issue', requirePerm('merch:issue'), ah(async (req, res) => {
  const { participantId, item, size, desk } = req.body || {};
  res.json(await issueMerch({ user: req.user, participantId, item, size, desk: desk || req.user.role }));
}));

api.post('/merch/replace', requirePerm('merch:replace'), ah(async (req, res) => {
  const { participantId, item, size, reason } = req.body || {};
  res.json(await replaceMerch({ user: req.user, participantId, item, size, reason }));
}));

// ---------- vendors and food
api.get('/vendors', requirePerm('vendors:read'), ah(async (req, res) => {
  res.json({ vendors: await M.Vendor.find({}).lean(), incidents: await M.VendorIncident.find({}).lean() });
}));

api.get('/vendors/coverage', requirePerm('vendors:read'), ah(async (req, res) => {
  const state = await loadState();
  const days = dateRangeKeys('2026-10-30', '2026-11-01');
  res.json({ ...foodRun(state), days, meals: ['breakfast', 'lunch', 'dinner'] });
}));

api.post('/vendors/:id/log-meal', requirePerm('vendors:write'), ah(async (req, res) => {
  const { date, meal, served } = req.body || {};
  return res.json(await runCommand({ user: req.user, action: 'MEAL_LOGGED', entity: { type: 'Vendor', id: req.params.id }, event: 'meal.logged' },
    async () => {
      await M.MealLog.updateOne({ vendorId: req.params.id, date, meal }, { served: Number(served), loggedBy: req.user.email }, { upsert: true });
      return { summary: { vendorId: req.params.id, date, meal, served }, result: { logged: true } };
    }));
}));

// ---------- disruptions
api.get('/disruptions', ah(async (req, res) => {
  res.json({ types: DISRUPTION_TYPES, recent: await M.Disruption.find({}).sort({ createdAt: -1 }).limit(30).lean() });
}));

api.post('/disruptions/preview', ah(async (req, res) => {
  const { type, params } = req.body || {};
  if (!DISRUPTION_TYPES.includes(type)) throw badRequest('Unknown disruption type', { allowed: DISRUPTION_TYPES });
  if (!can(req.user.role, 'disruptions:preview')) throw forbidden('Your role cannot preview disruptions');
  res.json(await previewDisruption(type, params || {}, req.user));
}));

api.post('/disruptions/:id/commit', ah(async (req, res) => {
  const { reason } = req.body || {};
  res.json(await commitDisruption(req.params.id, req.user, reason));
}));

// ---------- constraints and assumptions
api.get('/constraints', requirePerm('constraints:read'), ah(async (req, res) => {
  const { allConstraints, resolve } = await import('../constraints/registry.js');
  await import('../constraints/index.js');
  const { loadConstraintSettings } = await import('../constraints/index.js');
  const settings = await loadConstraintSettings();
  const resolved = resolve(settings);
  res.json({ constraints: allConstraints().map((c) => ({ id: c.id, scope: c.scope, kind: c.kind, risk: c.risk, label: c.label,
    enabled: resolved[c.id].enabled, params: resolved[c.id].params, engineLevel: !!c.engineLevel })) });
}));

api.get('/assumptions', requirePerm('assumptions:read'), ah(async (req, res) => {
  res.json({ assumptions: await M.Assumption.find({}).sort({ key: 1 }).lean() });
}));

api.put('/assumptions/:key', requirePerm('override:high'), ah(async (req, res) => {
  const { value, reason } = req.body || {};
  checkRisk(req.user, 'high', reason);
  const out = await runCommand({ user: req.user, action: 'ASSUMPTION_CHANGED', entity: { type: 'Assumption', id: req.params.key }, reason, risk: 'high', event: 'assumption.changed' },
    async () => {
      const a = await M.Assumption.findOneAndUpdate({ key: req.params.key }, { value, updatedBy: req.user.email }, { new: true }).lean();
      if (!a) throw notFound('No such assumption');
      invalidateAssumptions();
      return { summary: { key: a.key, value }, result: a };
    });
  res.json(out);
}));

// ---------- audit
api.get('/audit', requirePerm('dashboard:read'), ah(async (req, res) => {
  const rows = await M.AuditLog.find({}).sort({ seq: -1 }).limit(Math.min(Number(req.query.limit) || 100, 500)).lean();
  res.json({ rows });
}));

api.get('/audit/verify', requirePerm('dashboard:read'), ah(async (req, res) => res.json(await verifyAuditChain())));

// ---------- exports (plans as files)
api.get('/export/:kind.csv', requirePerm('exports:read'), ah(async (req, res) => {
  const kind = req.params.kind;
  let csv;
  if (kind === 'accommodation') {
    const plan = await activePlan('accommodation');
    const rows = plan ? await M.Allocation.find({ planId: plan.planId, status: { $ne: 'released' } }).sort({ participantId: 1 }).lean() : [];
    csv = toCsv(rows.map((r) => ({ participant_id: r.participantId, contingent_id: r.contingentId, bed: r.bed?.roomId || r.bed?.propertyId || '',
      site: r.bed?.site || '', check_in: fmtIST(r.checkIn), check_out: fmtIST(r.checkOut), nights: r.nights, cost_inr: r.cost || 0,
      status: r.status, reasons: (r.reasonCodes || []).join('|') })),
      ['participant_id', 'contingent_id', 'bed', 'site', 'check_in', 'check_out', 'nights', 'cost_inr', 'status', 'reasons']);
  } else if (kind === 'schedule') {
    const plan = await activePlan('schedule');
    const rows = plan ? await M.Slot.find({ planId: plan.planId }).sort({ start: 1 }).lean() : [];
    csv = toCsv(rows.map((s) => ({ slot_id: s.slotId, event_id: s.eventId, round: s.round, heat: s.heat, venue_id: s.venueId,
      start: fmtIST(s.start), end: fmtIST(s.end), expected_size: s.expectedSize, status: s.status, reasons: (s.reasonCodes || []).join('|') })),
      ['slot_id', 'event_id', 'round', 'heat', 'venue_id', 'start', 'end', 'expected_size', 'status', 'reasons']);
  } else if (kind === 'inventory') {
    const rows = await M.StockBalance.find({}).lean();
    csv = toCsv(rows.map((r) => ({ item: r.item, location: r.location, state: r.state, qty: r.qty })), ['item', 'location', 'state', 'qty']);
  } else throw notFound('Export is accommodation, schedule or inventory');
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="festos-${kind}.csv"`);
  res.send(csv);
}));
