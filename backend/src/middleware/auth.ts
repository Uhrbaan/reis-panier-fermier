import type { NextFunction, Request, RequestHandler, Response } from 'express';

import { db } from '../db.js';
import { findUserById } from '../repositories/users.js';
import { extractBearerToken, verifyToken } from '../services/jwt.js';
import { toPublicUser, type Role } from '../types/models.js';

type AsyncRequestHandler = (req: Request, res: Response, next: NextFunction) => unknown;

function unauthorized(res: Response, message: string): void {
  res.status(401).json({ error: 'UNAUTHORIZED', message });
}

/**
 * Rejects requests without a valid `Authorization: Bearer <jwt>` header.
 *
 * The user is re-read from SQLite on every request (not trusted from the token
 * payload) so that a deleted account or a changed role takes effect immediately.
 * This middleware is the security boundary: never rely on Vue Router guards.
 */
export const requireAuth: RequestHandler = (req: Request, res: Response, next: NextFunction): void => {
  const token = extractBearerToken(req.headers.authorization);

  if (!token) {
    unauthorized(res, 'Missing or malformed Authorization header.');
    return;
  }

  let userId: number;
  try {
    userId = verifyToken(token).id;
  } catch {
    unauthorized(res, 'Invalid or expired token.');
    return;
  }

  const user = findUserById(db, userId);
  if (!user) {
    unauthorized(res, 'Account no longer exists.');
    return;
  }

  req.user = toPublicUser(user);
  next();
};

/**
 * Restricts a route to one or more roles (`C2-F1`…`C3-F1` ownership isolation).
 * Must be mounted after `requireAuth`.
 */
export function requireRole(...allowedRoles: Role[]): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      // Programming error: requireRole was mounted without requireAuth.
      unauthorized(res, 'Authentication required.');
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({
        error: 'FORBIDDEN',
        message: `This resource requires one of the following roles: ${allowedRoles.join(', ')}.`,
      });
      return;
    }

    next();
  };
}

/** Wrap an async handler so rejected promises reach the Express error handler. */
export function asyncHandler(handler: AsyncRequestHandler): RequestHandler {
  return (req, res, next) => {
    void Promise.resolve(handler(req, res, next)).catch(next);
  };
}

/**
 * Attach `req.user` when a valid token is present, but never reject.
 *
 * Used where authentication is optional: an anonymous visitor is a legitimate
 * caller, not an error (`ADR-10`). Any failure to verify the token — malformed,
 * expired, account deleted — degrades to "no user" rather than a `401`, so a
 * stale token can never lock someone out of their own basket.
 */
export const optionalAuth: RequestHandler = (req: Request, _res: Response, next: NextFunction): void => {
  const token = extractBearerToken(req.headers.authorization);
  if (!token) {
    next();
    return;
  }

  try {
    const user = findUserById(db, verifyToken(token).id);
    if (user) {
      req.user = toPublicUser(user);
    }
  } catch {
    // Ignored on purpose: see the doc comment above.
  }

  next();
};
