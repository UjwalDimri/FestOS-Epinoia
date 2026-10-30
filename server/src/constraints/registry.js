// Every rule is a registry entry: hard rules filter candidates, soft rules add weight x penalty.
// A midnight twist becomes one new entry + a toggle in the Constraint Console.
const registry = new Map();

export function register(c) {
  if (registry.has(c.id)) throw new Error(`Duplicate constraint ${c.id}`);
  registry.set(c.id, { defaultEnabled: true, defaultParams: {}, ...c });
}

export const allConstraints = () => [...registry.values()];
export const getConstraint = (id) => registry.get(id);

// settings: { [id]: { enabled, params } } from the ConstraintSetting collection
export function resolve(settings = {}) {
  const out = {};
  for (const c of registry.values()) {
    const s = settings[c.id] || {};
    out[c.id] = { enabled: s.enabled ?? c.defaultEnabled, params: { ...c.defaultParams, ...(s.params || {}) } };
  }
  return out;
}

export function activeFor(scope, settings = {}) {
  const resolved = resolve(settings);
  return allConstraints()
    .filter((c) => c.scope === scope && resolved[c.id].enabled)
    .map((c) => ({ ...c, params: resolved[c.id].params }));
}

export function isOn(id, settings = {}) {
  return resolve(settings)[id]?.enabled === true;
}

export function paramsOf(id, settings = {}) {
  return resolve(settings)[id]?.params || {};
}
