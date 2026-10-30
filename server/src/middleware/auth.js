import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { User } from '../models/index.js';
import { can, ROLES } from '../shared/roles.js';
import { forbidden, HttpError } from '../utils/errors.js';

// Two modes. "dev": email + password -> JWT signed by this server (one test account per role).
// "clerk": Clerk session token; the role must come from the verified session's publicMetadata, never from the client.
export function signToken(user) {
  return jwt.sign({ sub: user.userId, email: user.email, role: user.role }, env.jwtSecret, { expiresIn: '12h' });
}

export async function authenticate(req, _res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) throw new HttpError(401, 'Sign in required');

    if (env.authMode === 'clerk') {
      const { getAuth } = await import('@clerk/express');
      const auth = getAuth(req);
      if (!auth?.userId) throw new HttpError(401, 'Sign in required');
      const role = auth.sessionClaims?.metadata?.role || auth.sessionClaims?.publicMetadata?.role;
      if (!ROLES[role]) throw forbidden('Your account has no festival role. Ask the Director to assign one.');
      req.user = { userId: auth.userId, email: auth.sessionClaims?.email || auth.userId, role };
      return next();
    }

    const payload = jwt.verify(token, env.jwtSecret);
    const u = await User.findById(payload.sub).lean().catch(() => null);
    const user = u || await User.findOne({ email: payload.email }).lean();
    if (!user) throw new HttpError(401, 'Account no longer exists. Sign in again.');
    req.user = { userId: String(user._id), email: user.email, role: user.role, name: user.name };
    next();
  } catch (e) {
    next(e instanceof HttpError ? e : new HttpError(401, 'Your session expired. Sign in again.'));
  }
}

export const requirePerm = (perm) => (req, _res, next) => {
  if (!can(req.user?.role, perm)) return next(forbidden(`Your role (${ROLES[req.user?.role] || 'unknown'}) cannot do this`, { needs: perm }));
  next();
};
