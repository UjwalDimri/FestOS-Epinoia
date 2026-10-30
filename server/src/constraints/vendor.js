import { register } from './registry.js';

const rules = [
  ['VND_CERT_VALID', 'hard', 'high', true, 'A vendor counts only on days its hygiene certificate is valid (Director override with reason)'],
  ['VND_OPEN_FOR_MEAL', 'hard', 'medium', true, 'A vendor counts only for meals inside its operating hours'],
  ['VND_NOT_INTERRUPTED', 'hard', 'high', true, 'A vendor with an active incident does not count'],
  ['VND_LABELS_VERIFIED', 'hard', 'medium', false, 'Exclude vendors whose menu contradicts their dietary tags until verified'],
];
for (const [id, kind, risk, defaultEnabled, label] of rules) {
  register({ id, scope: 'vendor', kind, risk, defaultEnabled, label, engineLevel: true });
}
