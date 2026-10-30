import { env } from './config/env.js';
import { connectDb } from './config/db.js';
import { createApp } from './app.js';
import { ensureAssumptions } from './services/assumptions.js';
import { loadConstraintSettings } from './constraints/index.js';
import { migrateTeam1SchemaFields } from './services/schemaMigrations.js';
import * as M from './models/index.js';

await connectDb(env.mongoUri);
await migrateTeam1SchemaFields();
await ensureAssumptions();
const people = await M.User.countDocuments({});
if (!people) console.warn('[server] No data yet. Run: npm run seed');
const app = createApp();
app.listen(env.port, () => console.log(`[server] FestOS API on http://localhost:${env.port} (auth: ${env.authMode})`));
