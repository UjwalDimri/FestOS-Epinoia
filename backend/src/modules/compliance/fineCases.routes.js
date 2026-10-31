import express from 'express';
import crypto from 'node:crypto';
import * as M from '../../models/index.js';
import { requirePerm } from '../../middleware/auth.js';
import { ah, badRequest, conflict, notFound } from '../../utils/errors.js';
import { runCommand } from '../../services/command.js';

export const fineCasesApi = express.Router();

export const ACCOMMODATION_RULES = [
  { id: 'ACC_RULE_1', title: 'Respect declared accessibility and privacy needs.' },
  { id: 'ACC_RULE_2', title: 'Support requested gender-segregated housing.' },
  { id: 'ACC_RULE_3', title: 'Keep contingents together where possible; explain necessary splits.' },
  { id: 'ACC_RULE_4', title: 'Keep contingent leaders and escorts nearby.' },
  { id: 'ACC_RULE_5', title: 'Respect room capacity, readiness, cleaning, check-in and check-out windows.' },
  { id: 'ACC_RULE_6', title: 'Account for event times, external travel, transport and safety coverage.' },
  { id: 'ACC_RULE_7', title: 'Get authorized approval before exceeding the external placement budget.' },
  { id: 'ACC_RULE_8', title: 'Never treat blank fields as consent or as absence of need.' },
];
const ruleById = new Map(ACCOMMODATION_RULES.map((rule) => [rule.id, rule]));
const idFor = () => `FINE-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
const safeCase = (row) => row;

fineCasesApi.get('/fine-rules', requirePerm('fines:read'), (_req, res) => res.json({ rules: ACCOMMODATION_RULES }));

fineCasesApi.get('/fine-cases', requirePerm('fines:read'), ah(async (req, res) => {
  const query = req.user.role === 'festival_director' ? {} : { 'reportedBy.userId': req.user.userId };
  const cases = await M.FineCase.find(query).sort({ createdAt: -1 }).limit(200).lean();
  res.json({ cases: cases.map(safeCase) });
}));

fineCasesApi.post('/fine-cases', requirePerm('fines:report'), ah(async (req, res) => {
  const body = req.body || {};
  const rule = ruleById.get(String(body.ruleId || ''));
  if (!rule) throw badRequest('Choose one of the accommodation rules from the problem statement.');
  const targetType = String(body.targetType || '');
  if (!['participant', 'contingent'].includes(targetType)) throw badRequest('targetType must be participant or contingent.');
  const report = String(body.report || '').trim();
  if (report.length < 10 || report.length > 3000) throw badRequest('Describe what was observed (10–3000 characters).');
  const evidence = String(body.evidence || '').trim();
  if (evidence.length > 2000) throw badRequest('Evidence notes must be 2000 characters or fewer.');
  const proposedFine = Number(body.proposedFine);
  if (!Number.isFinite(proposedFine) || proposedFine < 0 || proposedFine > 1000000) throw badRequest('Proposed fine must be between ₹0 and ₹10,00,000.');
  const observedAt = body.observedAt ? new Date(body.observedAt) : new Date();
  if (Number.isNaN(observedAt.getTime())) throw badRequest('Observed date must be valid.');

  let participant = null;
  let contingentId = String(body.contingentId || '').trim();
  if (targetType === 'participant') {
    const participantId = String(body.participantId || '').trim();
    if (!participantId) throw badRequest('Participant ID is required.');
    participant = await M.Participant.findOne({ participantId, active: { $ne: false } }).lean();
    if (!participant) throw notFound('Active participant not found.');
    contingentId = participant.contingentId || contingentId;
  }
  if (!contingentId) throw badRequest('Contingent ID is required.');
  const contingent = await M.Contingent.findOne({ contingentId }).lean();
  if (!contingent) throw notFound('Contingent not found.');
  if (participant && participant.contingentId && participant.contingentId !== contingentId) throw badRequest('Participant and contingent do not match.');

  const caseId = idFor();
  const row = await runCommand({ user: req.user, action: 'FINE_CASE_REPORTED', entity: { type: 'FineCase', id: caseId }, risk: 'low' }, async (session) => {
    const created = await M.FineCase.create([{
      caseId, ruleId: rule.id, ruleTitle: rule.title, targetType,
      participantId: participant?.participantId || null,
      participantName: participant?.name || [participant?.firstName, participant?.lastName].filter(Boolean).join(' ') || null,
      contingentId, contingentName: contingent.college || contingent.contingentId,
      observedAt, report, evidence, proposedFine,
      reportedBy: { userId: req.user.userId, email: req.user.email, role: req.user.role },
    }], session ? { session } : {});
    return { result: created[0].toObject(), summary: { caseId, ruleId: rule.id, targetType, proposedFine } };
  });
  res.status(201).json({ case: row });
}));

fineCasesApi.post('/fine-cases/:caseId/decision', requirePerm('fines:decide'), ah(async (req, res) => {
  const decision = String(req.body?.decision || '');
  const reason = String(req.body?.reason || '').trim();
  if (!['approve', 'dismiss'].includes(decision)) throw badRequest('decision must be approve or dismiss.');
  if (reason.length < 5 || reason.length > 1000) throw badRequest('A decision reason of 5–1000 characters is required.');
  const approvedFine = Number(req.body?.approvedFine);
  if (decision === 'approve' && (!Number.isFinite(approvedFine) || approvedFine <= 0 || approvedFine > 1000000)) {
    throw badRequest('Approved fine must be greater than ₹0 and no more than ₹10,00,000.');
  }
  const current = await M.FineCase.findOne({ caseId: req.params.caseId });
  if (!current) throw notFound('Fine case not found.');
  if (current.status !== 'pending_review') throw conflict('This report has already received an admin decision.');
  const status = decision === 'approve' ? 'approved' : 'dismissed';
  const result = await runCommand({ user: req.user, action: decision === 'approve' ? 'FINE_CASE_APPROVED' : 'FINE_CASE_DISMISSED', entity: { type: 'FineCase', id: current.caseId }, reason, risk: 'high' }, async (session) => {
    const updated = await M.FineCase.findOneAndUpdate({ caseId: current.caseId, status: 'pending_review' }, {
      $set: { status, decision: { by: req.user.email, userId: req.user.userId, role: req.user.role, reason, approvedFine: decision === 'approve' ? approvedFine : null, at: new Date() } },
    }, { new: true, ...(session ? { session } : {}) });
    if (!updated) throw conflict('This report has already received an admin decision.');
    return { result: updated.toObject(), summary: { caseId: current.caseId, status, approvedFine: decision === 'approve' ? approvedFine : null } };
  });
  res.json({ case: result });
}));
