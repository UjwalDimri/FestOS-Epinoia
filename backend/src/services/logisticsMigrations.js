import { Location, StockBalance } from '../models/index.js';

// Preserve the existing inventory import's free-form location strings by registering them
// as active locations the first time the upgraded logistics API starts.
export async function migrateLegacyStockLocations() {
  const names = await StockBalance.distinct('location');
  for (const locationId of names.filter(Boolean)) {
    await Location.updateOne({ locationId }, { $setOnInsert: { locationId, name: locationId, locationType: 'other', status: 'active', notes: 'Migrated from legacy inventory stock balances.' } }, { upsert: true });
  }
  return { migratedLocationNames: names.filter(Boolean).length };
}
