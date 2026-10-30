// Vercel entrypoint: export the Express app as a serverless handler.
import express from 'express';
import { env } from './src/config/env.js';
import { connectDb } from './src/config/db.js';
import { createApp } from './src/appFactory.js';
import { ensureAssumptions } from './src/services/assumptions.js';
import { migrateTeam1SchemaFields } from './src/services/schemaMigrations.js';
import * as M from './src/models/index.js';

await connectDb(env.mongoUri);
await migrateTeam1SchemaFields();
await ensureAssumptions();

if (!(await M.User.countDocuments({}))) {
  console.warn('[server] No data yet. Run: npm run seed');
}

export default createApp(express);
