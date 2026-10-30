// Vendor coverage: for each day x meal x diet group, which vendors can legitimately serve the people on site.
import { istDateKey, atIST } from '../utils/time.js';
import { MEALS } from '../shared/enums.js';

export function onSiteAt(people, when) {
  const t = new Date(when).getTime();
  return people.filter((p) => p.active !== false && !p.quarantined && p.arrivalDateTime && p.departureDateTime
    && new Date(p.arrivalDateTime).getTime() <= t && t < new Date(p.departureDateTime).getTime());
}

export function vendorOpenFor(vendor, meal, mealWindows) {
  const [open, close] = [vendor.hours.open, vendor.hours.close].map((s) => (s || '').slice(0, 5));
  const [ms, me] = mealWindows[meal];
  return open <= ms && close >= me;
}

export function vendorActive(vendor, day, incidents, overrides) {
  const expiry = vendor.certExpiry ? new Date(vendor.certExpiry) : null;
  const dayEnd = atIST(day, '23:59');
  const certOk = !expiry || expiry >= dayEnd || (overrides?.certOverride && new Date(overrides.certOverride.until) >= dayEnd);
  const incident = incidents.some((i) => i.vendorId === vendor.vendorId && istDateKey(i.start) <= day && day <= istDateKey(i.end));
  return { certOk, interrupted: incident, active: certOk && !incident };
}

export function dietCoverage({ vendors, incidents = [], people, days, mealWindows, dietServedBy, overrides = {} }) {
  const rows = [];
  const groupOf = (p) => {
    const needs = p.dietaryNeeds?.status === 'declared' ? p.dietaryNeeds.needs : [];
    if (needs.includes('nut_allergy')) return 'nut_allergy';
    if (needs.includes('gluten_free')) return 'gluten_free';
    if (needs.includes('jain')) return 'jain';
    if (needs.includes('halal')) return 'halal';
    if (needs.includes('vegetarian')) return 'vegetarian';
    if (p.dietaryNeeds?.status === 'unknown') return 'unknown';
    return 'non_vegetarian';
  };
  for (const day of days) {
    for (const meal of MEALS) {
      const when = atIST(day, mealWindows[meal][0]);
      const present = onSiteAt(people, when);
      const groups = new Map();
      for (const p of present) {
        const g = groupOf(p);
        groups.set(g, (groups.get(g) || 0) + 1);
      }
      const activeVendors = vendors.filter((v) => {
        const st = vendorActive(v, day, incidents, overrides[v.vendorId]);
        return st.active && vendorOpenFor(v, meal, mealWindows);
      });
      for (const [group, headcount] of groups) {
        const tags = dietServedBy[group] || [];
        const servers = activeVendors.filter((v) => tags.includes('*') || v.dietaryTags.some((t) => tags.includes(t)));
        const capacity = servers.reduce((s, v) => s + (v.capacity || 0), 0);
        rows.push({
          day, meal, diet: group, headcount, servers: servers.map((v) => v.vendorId), capacity,
          covered: servers.length > 0 && capacity >= headcount,
          gap: servers.length === 0 ? 'NO_VENDOR' : capacity < headcount ? 'CAPACITY_SHORT' : null,
        });
      }
    }
  }
  return rows;
}

export function summarizeCoverage(rows) {
  const gaps = rows.filter((r) => !r.covered);
  return {
    cells: rows.length,
    uncovered: gaps.length,
    uncoveredHeadcount: gaps.reduce((s, r) => s + r.headcount, 0),
    noVendorGroups: [...new Set(gaps.filter((g) => g.gap === 'NO_VENDOR').map((g) => g.diet))],
  };
}
