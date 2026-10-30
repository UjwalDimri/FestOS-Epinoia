import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { AuditLog, Counter } from '../models/index.js';
import { supportsTransactions } from '../config/db.js';
import { emit } from './eventBus.js';
import { badRequest, forbidden } from '../utils/errors.js';
import { can } from '../shared/roles.js';

// Every write goes through here: risk check -> write -> audit entry (hash-chained) -> domain event.
// The client never writes audit entries; they are created in the same operation as the change.

function hashEntry(entry, prevHash) {
  const payload = JSON.stringify({ seq: entry.seq, at: entry.at, actor: entry.actor, action: entry.action, entity: entry.entity,
    reason: entry.reason, risk: entry.risk, summary: entry.summary, disruptionId: entry.disruptionId, prevHash });
  return crypto.createHash('sha256').update(payload).digest('hex');
}

export function checkRisk(user, risk, reason) {
  if (risk === 'high' && !can(user.role, 'override:high')) {
    throw forbidden('High-risk override: only the Festival Director can approve this', { risk });
  }
  if (risk === 'medium' && !can(user.role, 'override:medium') && !can(user.role, 'override:high')) {
    throw forbidden('Medium-risk override needs an organizer role', { risk });
  }
  if ((risk === 'high' || risk === 'medium') && (!reason || reason.trim().length < 5)) {
    throw badRequest('A reason (at least 5 characters) is required for this change');
  }
}

export async function appendAudit({ actor, action, entity, reason, risk, summary, disruptionId }, session) {
  const opts = session ? { session } : {};
  const counter = await Counter.findOneAndUpdate({ _id: 'audit' }, { $inc: { seq: 1 } }, { new: true, upsert: true, ...opts });
  const prev = await AuditLog.findOne({ seq: counter.seq - 1 }, { hash: 1 }, opts).lean();
  const entry = {
    seq: counter.seq, at: new Date(), actor: { userId: actor.userId, email: actor.email, role: actor.role },
    action, entity, reason: reason || null, risk: risk || 'low', summary: summary ?? null, disruptionId: disruptionId || null,
  };
  entry.prevHash = prev?.hash || 'GENESIS';
  entry.hash = hashEntry(entry, entry.prevHash);
  await AuditLog.create([entry], opts);
  return entry;
}

/**
 * runCommand({ user, action, entity, reason, risk, event }, async (session) => ({ summary, result }))
 */
export async function runCommand(meta, fn) {
  const { user, action, entity, reason, risk = 'low', event, disruptionId } = meta;
  checkRisk(user, risk, reason);
  const actor = { userId: user.userId, email: user.email, role: user.role };
  let out;
  if (supportsTransactions()) {
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        out = await fn(session);
        if (!out?.skipAudit) {
          await appendAudit({ actor, action, entity, reason, risk, summary: out?.summary, disruptionId }, session);
          for (const entry of out?.additionalAudits || []) await appendAudit({ actor, ...entry }, session);
        }
      });
    } finally {
      await session.endSession();
    }
  } else {
    out = await fn(null);
    await appendAudit({ actor, action, entity, reason, risk, summary: out?.summary, disruptionId }, null);
  }
  if (!out?.skipAudit) emit(event || action, { action, entity, actor });
  return out?.result ?? out;
}

export async function verifyAuditChain() {
  const entries = await AuditLog.find({}).sort({ seq: 1 }).lean();
  let prevHash = 'GENESIS';
  for (const e of entries) {
    const expected = hashEntry({ ...e, at: e.at }, prevHash);
    if (e.prevHash !== prevHash || e.hash !== expected) {
      return { ok: false, brokenAtSeq: e.seq, checked: entries.length };
    }
    prevHash = e.hash;
  }
  return { ok: true, checked: entries.length, lastHash: prevHash };
}
