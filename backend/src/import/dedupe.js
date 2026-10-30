// Duplicate-looking records: names repeat across real people (191 names for 2,836 rows) and phones are all unique,
// so a name match alone means nothing. Score pairs on several fields and send them to human review.
const WEIGHTS = { base: 40, age: 15, gender: 10, tshirtSize: 10, diet: 10, access: 5, arrival: 5, departure: 5 };

const val = {
  age: (p) => p.age,
  gender: (p) => p.gender,
  tshirtSize: (p) => p.tshirtSize,
  diet: (p) => (p.dietaryNeeds?.needs || []).join('|') || null,
  access: (p) => (p.accessibilityNeeds?.needs || []).join('|') || null,
  arrival: (p) => p.arrivalDateTime?.getTime?.() ?? p.arrivalDateTime,
  departure: (p) => p.departureDateTime?.getTime?.() ?? p.departureDateTime,
};

export function scorePair(a, b) {
  let score = WEIGHTS.base;
  const matched = ['name', 'contingentId'];
  const differing = [];
  for (const [field, fn] of Object.entries(val)) {
    const va = fn(a); const vb = fn(b);
    if (va === vb) { score += WEIGHTS[field]; matched.push(field); } else differing.push(field);
  }
  return { score, matched, differing };
}

export function findDuplicateCandidates(participants, threshold = 80) {
  const blocks = new Map();
  for (const p of participants) {
    if (p.personType !== 'participant') continue;
    const key = `${p.contingentId}::${p.name.trim().toLowerCase()}`;
    if (!blocks.has(key)) blocks.set(key, []);
    blocks.get(key).push(p);
  }
  const out = [];
  for (const group of blocks.values()) {
    if (group.length < 2) continue;
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const s = scorePair(group[i], group[j]);
        if (s.score >= threshold) out.push({ a: group[i].participantId, b: group[j].participantId, ...s });
      }
    }
  }
  return out.sort((x, y) => y.score - x.score);
}
