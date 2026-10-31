import { parseIST, fmtIST } from '../utils/time.js';
import { blank } from '../utils/csv.js';
import { GENDER_TO_HOUSING, ACCESSIBILITY_CODES, DIET_CODES, PREFERENCE_TAGS } from '../shared/enums.js';
import { ROLE_FROM_CSV } from '../shared/roles.js';

export function normalizeParticipant(row, festEnd) {
  const issues = [];
  const id = row.participant_id;
  const genderRaw = blank(row.gender_as_given) ? null : row.gender_as_given.trim();
  const housingCategory = genderRaw ? (GENDER_TO_HOUSING[genderRaw] || 'unconfirmed') : 'unconfirmed';
  if (!genderRaw) {
    issues.push({ code: 'GENDER_NOT_PROVIDED', severity: 'medium', message: 'Gender is blank. Housing preference must be confirmed at the desk; it is never inferred.' });
  } else if (!GENDER_TO_HOUSING[genderRaw]) {
    issues.push({ code: 'GENDER_LABEL_UNKNOWN', severity: 'medium', message: `Unrecognised gender label "${genderRaw}"` });
  }

  const age = Number(row.age);
  const isMinor = Number.isFinite(age) ? age < 18 : null;
  if (isMinor) issues.push({ code: 'MINOR_CONSENT_UNKNOWN', severity: 'medium', message: `Participant is ${age}. Guardian consent status is not in the data.` });

  // The pack writes an explicit "None" when someone has no need. That is a declaration, not a blank.
  // A truly blank field stays "not_declared" / "unknown". pandas reads "None" as NaN, so never trust pandas counts here.
  const EXPLICIT_NONE = /^(none|no|n\/a|nil)$/i;
  const splitList = (v) => (blank(v) ? [] : String(v).split(/[;|]/).map((s) => s.trim()).filter(Boolean));
  const accRaw = splitList(row.accessibility_needs);
  const accNeeds = accRaw.filter((s) => !EXPLICIT_NONE.test(s)).map((s) => ACCESSIBILITY_CODES[s] || s.toLowerCase().replace(/\W+/g, '_'));
  let accessibilityNeeds;
  if (accNeeds.length) accessibilityNeeds = { status: 'declared', needs: accNeeds };
  else if (accRaw.some((s) => EXPLICIT_NONE.test(s))) accessibilityNeeds = { status: 'declared_none', needs: [] };
  else accessibilityNeeds = { status: 'not_declared', needs: [] };

  const dietRaw = splitList(row.dietary_needs);
  const dietNeeds = dietRaw.filter((s) => !EXPLICIT_NONE.test(s)).map((s) => DIET_CODES[s] || s.toLowerCase().replace(/\W+/g, '_'));
  let dietaryNeeds;
  if (dietNeeds.length) dietaryNeeds = { status: 'declared', needs: dietNeeds };
  else if (dietRaw.some((s) => EXPLICIT_NONE.test(s))) dietaryNeeds = { status: 'declared_none', needs: [] };
  else {
    dietaryNeeds = { status: 'unknown', needs: [] };
    issues.push({ code: 'DIETARY_NOT_PROVIDED', severity: 'medium', message: 'Dietary field is blank. Treated as unknown, never as "no restriction".' });
  }

  const arrivalDateTime = parseIST(row.arrival_datetime);
  const departureDateTime = parseIST(row.departure_datetime);
  let quarantined = false;
  if (!arrivalDateTime || !departureDateTime) {
    issues.push({ code: 'TIMING_UNPARSEABLE', severity: 'high', message: 'Arrival or departure could not be parsed' });
    quarantined = true;
  } else {
    if (departureDateTime <= arrivalDateTime) {
      issues.push({ code: 'ARRIVAL_AFTER_DEPARTURE', severity: 'high', message: `Arrives ${fmtIST(arrivalDateTime)} but departs ${fmtIST(departureDateTime)}. Quarantined from plans until resolved.` });
      quarantined = true;
    }
    if (arrivalDateTime > festEnd) {
      issues.push({ code: 'ARRIVES_AFTER_FEST', severity: 'high', message: `Arrives ${fmtIST(arrivalDateTime)}, after the fest ends.` });
      quarantined = true;
    }
  }

  const contact = (row.contact || '').trim();
  if (!/^\+91-\d{10}$/.test(contact)) issues.push({ code: 'CONTACT_FORMAT_INVALID', severity: 'low', message: 'Contact number is not in +91-XXXXXXXXXX format' });

  const accReq = String(row.accommodation_requested || '').trim().toLowerCase();
  const accommodationRequested = accReq === 'yes' ? true : accReq === 'no' ? false : null;
  if (accommodationRequested === null) issues.push({ code: 'ACCOMMODATION_FLAG_UNKNOWN', severity: 'medium', message: 'Accommodation request is blank; not treated as "no".' });

  return {
    doc: {
      participantId: id, name: row.name, contingentId: row.contingent_id, college: row.college, personType: 'participant',
      raw: row, gender: genderRaw, housingCategory, age: Number.isFinite(age) ? age : null, isMinor,
      contact, accessibilityNeeds, dietaryNeeds,
      arrivalDateTime, departureDateTime, accommodationRequested,
      tshirtSize: blank(row.tshirt_size) ? null : row.tshirt_size.trim().toUpperCase(),
      quarantined, active: !quarantined,
    },
    issues,
  };
}

export function parsePreferences(text) {
  return String(text || '').split(';').map((s) => s.trim().toLowerCase()).map((s) => PREFERENCE_TAGS[s] ?? (s ? s.replace(/\W+/g, '_') : null)).filter(Boolean);
}

const ITEM_ALIASES = { barricades: 'barricade', tables: 'table', mics: 'mic', speakers: 'speaker', 'extension cords': 'extension cord', cameras: 'camera', tripods: 'tripod', projectors: 'projector' };

export function parseEquipment(text) {
  if (!text || /no special/i.test(text)) return [];
  return text.split(';').map((s) => s.trim()).filter(Boolean).map((part) => {
    const m = part.match(/^(\d+)\s+(.+)$/);
    const qty = m ? Number(m[1]) : 1;
    const name = (m ? m[2] : part).toLowerCase();
    return { item: ITEM_ALIASES[name] || name.replace(/s$/, ''), qty };
  });
}

export function parseRequirements(text) {
  return String(text || '').split(';').map((s) => s.trim().toLowerCase()).filter(Boolean);
}

export function parseWindows(text) {
  return String(text || '').split(';').map((s) => s.trim()).filter(Boolean).map((w) => {
    const m = w.match(/^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2})-(\d{2}:\d{2})$/);
    return m ? { start: parseIST(`${m[1]} ${m[2]}`), end: parseIST(`${m[1]} ${m[3]}`) } : null;
  }).filter(Boolean);
}

export function normalizeStaff(row) {
  const role = ROLE_FROM_CSV[row.role] || 'volunteer';
  const department = ({ festival_director: 'leadership', registration_desk: 'registration', hospitality: 'hospitality', events_team: 'events', logistics_head: 'logistics', merchandise_desk: 'merchandise', food_coordinator: 'food', volunteer: 'volunteer' })[role];
  return { memberId: row.member_id, name: row.name, roleLabel: row.role, role, department, shift: row.shift, phone: row.phone, status: 'active' };
}

export function stateFromCondition(condition, location) {
  const c = String(condition || '').toLowerCase();
  if (c === 'under repair') return 'damaged';
  if (c === 'needs check') return 'needs_check';
  if (/^van/i.test(location || '')) return 'in_transit';
  return 'available';
}

export function parseVendor(row) {
  const tags = String(row.dietary_options || '').split(';').map((s) => s.trim().toLowerCase()).filter(Boolean);
  const [open, close] = String(row.hours || '').split('-').map((s) => s.trim());
  const terms = [];
  const t = String(row.payment_terms || '').toLowerCase();
  if (t.includes('minimum guarantee')) terms.push('minimum_guarantee');
  if (t.includes('50% advance')) terms.push('advance_50');
  if (t.includes('per item')) terms.push('per_item');
  return {
    vendorId: row.vendor_id, name: row.vendor_name, menu: row.menu, dietaryTags: tags,
    certExpiry: parseIST(`${row.hygiene_certificate_expiry} 23:59`), hours: { open, close },
    capacity: Number(row.capacity), paymentTermsRaw: row.payment_terms, paymentTerms: terms,
  };
}

// Menu-vs-tag contradictions worth flagging (never silently "fixed").
export function vendorLabelConflicts(v) {
  const out = [];
  const menu = (v.menu || '').toLowerCase();
  if (menu.includes('vegan') && v.dietaryTags.includes('non-vegetarian')) out.push(`Menu "${v.menu}" is tagged non-vegetarian`);
  if (menu.includes('jain') && !v.dietaryTags.includes('jain')) out.push(`Menu "${v.menu}" is not tagged Jain`);
  if (menu.includes('breakfast') && v.hours.open && v.hours.open > '09:00') out.push(`Breakfast vendor opens at ${v.hours.open}`);
  return out;
}
