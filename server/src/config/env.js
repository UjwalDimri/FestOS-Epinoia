import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(here, '../../.env') });

export const env = {
  mongoUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/festos_demo?replicaSet=rs0',
  port: Number(process.env.PORT || 4000),
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  authMode: (process.env.AUTH_MODE || 'dev').toLowerCase(),
  jwtSecret: process.env.JWT_SECRET || 'change-me-before-demo',
  seedPassword: process.env.SEED_PASSWORD || 'FestOS@2026',
  clerkSecretKey: process.env.CLERK_SECRET_KEY || '',
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
  anthropicModel: process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5',
  dataDir: path.resolve(here, '../..', process.env.DATA_DIR || '../data/raw'),
};
