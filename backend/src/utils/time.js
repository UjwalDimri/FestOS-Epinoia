// All CSV times are local IST with no zone. Parse them explicitly as +05:30 so a UTC server never shifts them.
export const IST_OFFSET = '+05:30';
const IST_MS = 330 * 60 * 1000;

export function parseIST(value) {
  if (!value) return null;
  const s = String(value).trim();
  const m = s.match(/^(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}):(\d{2}))?/);
  if (!m) return null;
  const d = new Date(`${m[1]}T${m[2] || '00'}:${m[3] || '00'}:00${IST_OFFSET}`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function fmtIST(date) {
  if (!date) return null;
  const d = new Date(new Date(date).getTime() + IST_MS);
  return d.toISOString().slice(0, 16).replace('T', ' ');
}

export function istDateKey(date) {
  const d = new Date(new Date(date).getTime() + IST_MS);
  return d.toISOString().slice(0, 10);
}

export function atIST(dateKey, hhmm) {
  return new Date(`${dateKey}T${hhmm}:00${IST_OFFSET}`);
}

export function addMinutes(date, minutes) {
  return new Date(new Date(date).getTime() + minutes * 60000);
}

export function overlaps(aStart, aEnd, bStart, bEnd) {
  return new Date(aStart) < new Date(bEnd) && new Date(bStart) < new Date(aEnd);
}

export function dateRangeKeys(startKey, endKey) {
  const out = [];
  let d = new Date(`${startKey}T00:00:00Z`);
  const end = new Date(`${endKey}T00:00:00Z`);
  while (d <= end) {
    out.push(d.toISOString().slice(0, 10));
    d = new Date(d.getTime() + 86400000);
  }
  return out;
}

// Parses "22:00-06:00" into minutes-of-day ranges; a range crossing midnight becomes two ranges.
export function parseShift(text) {
  const m = String(text || '').match(/(\d{2}):(\d{2})\s*-\s*(\d{2}):(\d{2})/);
  if (!m) return [];
  const a = Number(m[1]) * 60 + Number(m[2]);
  const b = Number(m[3]) * 60 + Number(m[4]);
  return a < b ? [[a, b]] : [[a, 1440], [0, b]];
}
