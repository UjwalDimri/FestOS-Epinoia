import mongoose from 'mongoose';
import { env } from '../src/config/env.js';

// One-time: turns a standalone mongod into a single-node replica set (needed for transactions).
const url = env.mongoUri.replace(/\/[^/?]*(\?.*)?$/, '/admin');
const conn = await mongoose.createConnection(url.replace(/\?.*$/, '') + '?directConnection=true').asPromise();
const mongoUrl = new URL(env.mongoUri);
const replicaHost = `${mongoUrl.hostname}:${mongoUrl.port || 27017}`;
try {
  await conn.db.admin().command({ replSetInitiate: { _id: 'rs0', members: [{ _id: 0, host: replicaHost }] } });
  console.log('[replica] initiated rs0');
} catch (e) {
  console.log('[replica] already initiated or', e.codeName || e.message);
} finally {
  await conn.close();
}
