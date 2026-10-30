import { PARTICIPANT_FIELDS } from '../shared/roles.js';

export function maskContact(phone) {
  if (!phone) return null;
  const digits = String(phone).replace(/\D/g, '');
  return `+91-XXXXXX${digits.slice(-4)}`;
}

// Keep only the fields this role may see. Sensitive values never reach the response unless revealed with a reason.
export function maskParticipant(p, role) {
  const allowed = new Set(PARTICIPANT_FIELDS[role] || PARTICIPANT_FIELDS.volunteer);
  const out = {};
  const full = { ...p, contactMasked: maskContact(p.contact), issues: p.issues, quarantined: p.quarantined, mergedInto: p.mergedInto };
  for (const k of Object.keys(full)) if (allowed.has(k)) out[k] = full[k];
  delete out.contact; delete out.raw; delete out.attrs;
  return out;
}
