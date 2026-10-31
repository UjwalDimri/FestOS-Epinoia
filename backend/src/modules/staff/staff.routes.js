import express from 'express';
import * as M from '../../models/index.js';
import { ah } from '../../utils/errors.js';
import { requirePerm } from '../../middleware/auth.js';
import { ROLES } from '../../shared/roles.js';

export const staffApi = express.Router();

function shiftMinutes(value) {
  const match = /^(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})$/.exec(String(value || '').trim());
  if (!match) return null;
  const [, sh, sm, eh, em] = match.map(Number);
  if (sh > 23 || eh > 23 || sm > 59 || em > 59) return null;
  const start = sh * 60 + sm;
  let end = eh * 60 + em;
  if (end <= start) end += 24 * 60;
  return { start, end };
}

function buildCoverage(staff) {
  return Object.entries(ROLES).map(([role, roleLabel]) => {
    const members = staff.filter((person) => person.role === role);
    const covered = Array.from({ length: 24 }, (_, hour) => members.some((person) => {
      const shift = shiftMinutes(person.shift);
      if (!shift) return false;
      const start = shift.start % 1440;
      const end = shift.end % 1440;
      const covers = (minute) => shift.end > 1440
        ? minute >= start || minute < end
        : minute >= start && minute < end;
      return covers(hour * 60);
    }));
    return { role, roleLabel, staffCount: members.length, coveredHours: covered.filter(Boolean).length,
      uncoveredHours: covered.flatMap((isCovered, hour) => isCovered ? [] : [hour]) };
  });
}

staffApi.get('/staff', requirePerm('staff:read'), ah(async (_req, res) => {
  const staff = await M.Staff.find({}).select('memberId name role roleLabel shift').sort({ role: 1, shift: 1, name: 1 }).lean();
  res.json({ staff, coverage: buildCoverage(staff) });
}));
