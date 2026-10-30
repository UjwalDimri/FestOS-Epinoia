import express from 'express';
import cors from 'cors';
import { env } from './config/env.js';
import { api } from './routes/api.js';
import { HttpError } from './utils/errors.js';
import { clerkMiddleware } from '@clerk/express';

export function createApp() {
  const app = express();
  app.use(cors({ origin: env.clientOrigin, credentials: false }));
  app.use(express.json({ limit: '1mb' }));
  if (env.authMode === 'clerk') app.use(clerkMiddleware());
  app.get('/api/health', (_req, res) => res.json({ ok: true, auth: env.authMode }));
  app.use('/api', api);
  app.use((req, res) => res.status(404).json({ error: 'Not found', path: req.path }));
  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message, details: err.details || null });
    if (err?.name === 'ValidationError' || err?.name === 'CastError') return res.status(400).json({ error: 'Bad request', details: err.message });
    if (err?.code === 11000) return res.status(409).json({ error: 'Duplicate: this record already exists', details: err.keyValue });
    console.error(err);
    return res.status(500).json({ error: 'Something went wrong on the server. Check the server log.' });
  });
  return app;
}
