import { connectDb, disconnectDb } from '../src/config/db.js';
import { runImport } from '../src/import/runImport.js';
import { ensureDefaultPlans } from '../src/services/bootstrap.js';
import { env } from '../src/config/env.js';

// Fresh demo: drops and re-imports everything from the CSV pack, then activates starting plans.
const started = Date.now();
await connectDb(env.mongoUri);
try {
  await runImport({ dataDir: env.dataDir });
  await ensureDefaultPlans({ userId: 'seed', email: 'seed@festos.test', role: 'festival_director' });
  console.log(`[seed] done in ${((Date.now() - started) / 1000).toFixed(1)}s`);
} finally {
  await disconnectDb();
}
