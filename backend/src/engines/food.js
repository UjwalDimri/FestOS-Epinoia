// Vendor coverage: for each day x meal x diet group, which vendors can legitimately serve the people on site.
import { istDateKey, atIST } from '../utils/time.js';
import { MEALS } from '../shared/enums.js';

export function onSiteAt(people, when) {
  const t = new Date(when).getTime();
  return people.filter((p) => p.active !== false && !p.quarantined && p.arrivalDateTime && p.departureDateTime
    && new Date(p.arrivalDateTime).getTime() <= t && t < new Date(p.departureDateTime).getTime());
}

export function vendorOpenFor(vendor, meal, mealWindows) {
  const [open, close] = [vendor.hours?.open, vendor.hours?.close].map((s) => (s || '').slice(0, 5));
  const [ms, me] = mealWindows[meal];
  return open <= ms && close >= me;
}

export function vendorActive(vendor, day, incidents, overrides) {
  const expiry = vendor.certExpiry ? new Date(vendor.certExpiry) : null;
  const dayEnd = atIST(day, '23:59');
  const certOverrideOk = overrides?.certOverride && new Date(overrides.certOverride.until) >= dayEnd;
  const certOk = Boolean((expiry && expiry >= dayEnd) || certOverrideOk);
  const incident = incidents.some((i) => i.vendorId === vendor.vendorId && istDateKey(i.start) <= day && day <= istDateKey(i.end));
  return { certOk, interrupted: incident, active: vendor.active !== false && certOk && !incident };
}

function allocateVendorCapacity(vendors, groups, dietServedBy) {
  const source = 0, vendorStart = 1, groupStart = vendorStart + vendors.length, sink = groupStart + groups.length;
  const residual = Array.from({ length: sink + 1 }, () => Array(sink + 1).fill(0));
  const original = Array.from({ length: sink + 1 }, () => Array(sink + 1).fill(0));
  const addEdge = (from, to, capacity) => { residual[from][to] += capacity; original[from][to] += capacity; };
  const totalDemand = groups.reduce((sum, group) => sum + group.headcount, 0);
  vendors.forEach((vendor, index) => addEdge(source, vendorStart + index, Math.max(0, Number(vendor.capacity) || 0)));
  vendors.forEach((vendor, vendorIndex) => groups.forEach((group, groupIndex) => {
    const allowedTags = dietServedBy[group.diet] || [];
    const vendorTags = [...new Set([...(vendor.dietaryTags || []), ...(vendor.menuItems || []).flatMap((item) => item.dietaryTags || [])])];
    if (allowedTags.includes('*') || vendorTags.some((tag) => allowedTags.includes(tag))) {
      addEdge(vendorStart + vendorIndex, groupStart + groupIndex, totalDemand);
    }
  }));
  groups.forEach((group, index) => addEdge(groupStart + index, sink, group.headcount));

  // Edmonds-Karp max flow shares each vendor's capacity across all diet groups.
  while (true) {
    const parent = Array(sink + 1).fill(-1), queue = [source]; parent[source] = source;
    for (let cursor = 0; cursor < queue.length && parent[sink] === -1; cursor++) {
      const node = queue[cursor];
      for (let next = 0; next <= sink; next++) if (parent[next] === -1 && residual[node][next] > 0) {
        parent[next] = node; queue.push(next);
      }
    }
    if (parent[sink] === -1) break;
    let flow = Infinity;
    for (let node = sink; node !== source; node = parent[node]) flow = Math.min(flow, residual[parent[node]][node]);
    for (let node = sink; node !== source; node = parent[node]) {
      residual[parent[node]][node] -= flow; residual[node][parent[node]] += flow;
    }
  }

  return groups.map((group, groupIndex) => {
    const assignments = vendors.map((vendor, vendorIndex) => ({
      vendorId: vendor.vendorId,
      capacity: original[vendorStart + vendorIndex][groupStart + groupIndex] - residual[vendorStart + vendorIndex][groupStart + groupIndex],
    })).filter((assignment) => assignment.capacity > 0);
    const capacity = assignments.reduce((sum, assignment) => sum + assignment.capacity, 0);
    return { ...group, servers: assignments.map((assignment) => assignment.vendorId), capacity,
      covered: capacity >= group.headcount, gap: capacity === 0 ? 'NO_VENDOR' : capacity < group.headcount ? 'CAPACITY_SHORT' : null };
  });
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
      const assigned = allocateVendorCapacity(activeVendors, [...groups].map(([diet, headcount]) => ({ diet, headcount })), dietServedBy);
      rows.push(...assigned.map((row) => ({ day, meal, ...row })));
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
