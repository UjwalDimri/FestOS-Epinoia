import * as M from '../models/index.js';

// Rename the earlier camelCase paths in-place so existing local databases keep their data.
const RENAMES = [
  [M.Participant, 'genderAsGiven', 'gender'],
  [M.Participant, 'accessibility', 'accessibilityNeeds'],
  [M.Participant, 'dietary', 'dietaryNeeds'],
  [M.Participant, 'arrival', 'arrivalDateTime'],
  [M.Participant, 'departure', 'departureDateTime'],
  [M.Contingent, 'leaderName', 'leader'],
  [M.Contingent, 'escortName', 'escort'],
  [M.Room, 'pool', 'gender'],
  [M.Room, 'accessible', 'accessibility'],
  [M.ExternalProperty, 'name', 'propertyName'],
  [M.ExternalProperty, 'transport', 'transportAvailability'],
  [M.ExternalProperty, 'accessible', 'accessibility'],
];

export async function migrateTeam1SchemaFields() {
  for (const [model, oldName, newName] of RENAMES) {
    await model.collection.updateMany(
      { [oldName]: { $exists: true }, [newName]: { $exists: false } },
      { $rename: { [oldName]: newName } },
    );
  }
}
