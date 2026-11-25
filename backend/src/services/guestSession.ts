import { createHash, randomBytes } from 'node:crypto';

import type Database from 'better-sqlite3';
import type { Request, Response } from 'express';

/**
 * Anonymous device identity (`ADR-10`).
 *
 * A visitor who has not signed up still needs continuity: their baskets and
 * notifications must follow them across page loads. The browser holds an opaque
 * token in an `HttpOnly` cookie and the server maps it to a `guest_sessions`
 * row, so the device has an identity without an account.
 *
 * Why an opaque token rather than the basket id in the cookie: if the cookie
 * *were* the id, changing `basket_id=1` to `2` would read someone else's order.
 * A random token cannot be enumerated, and `HttpOnly` keeps it out of reach of
 * injected scripts. `SameSite=Lax` blocks cross-site form posts, so a third
 * party cannot create baskets on the visitor's behalf.
 */

export const GUEST_COOKIE_NAME = 'pf_guest';

/** 30 days. Nobody waits that long for fresh produce, so this is generous. */
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const COOKIE_MAX_AGE_SECONDS = Math.floor(SESSION_TTL_MS / 1000);

/**
 * Only the digest is stored.
 *
 * A database leak then hands out nothing usable: the raw token exists only in
 * the visitor's browser. Plain SHA-256 is appropriate here (unlike for
 * passwords) because the token is 256 bits of randomness, so there is no
 * dictionary to attack.
 */
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export interface GuestSession {
  id: number;
}

/** Read a cookie without pulling in `cookie-parser`. */
export function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.cookie;
  if (!header) {
    return undefined;
  }

  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index === -1) {
      continue;
    }

    if (part.slice(0, index).trim() === name) {
      return decodeURIComponent(part.slice(index + 1).trim());
    }
  }

  return undefined;
}

/** The session referenced by the request cookie, if it is valid and unexpired. */
export function findGuestSessionByRequest(
  db: Database.Database,
  req: Request,
): GuestSession | undefined {
  const token = readCookie(req, GUEST_COOKIE_NAME);
  if (!token) {
    return undefined;
  }

  const row = db
    .prepare(
      `SELECT id FROM guest_sessions
        WHERE token_hash = ? AND expires_at > datetime('now')`,
    )
    .get(hashToken(token)) as GuestSession | undefined;

  return row;
}

/**
 * Resolve the request's guest session, creating one when needed.
 *
 * Returns the session id and, when a cookie was issued, the raw token so the
 * caller can set it. Expired sessions are pruned opportunistically here rather
 * than by a scheduled job: the prototype has no scheduler, and the table is
 * tiny.
 */
export function ensureGuestSession(
  db: Database.Database,
  req: Request,
): { sessionId: number; issuedToken?: string } {
  const existing = findGuestSessionByRequest(db, req);
  if (existing) {
    return { sessionId: existing.id };
  }

  const token = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();

  // Opportunistic cleanup: drop sessions that expired long enough ago that no
  // browser can still be holding a live cookie for them.
  db.prepare("DELETE FROM guest_sessions WHERE expires_at < datetime('now', '-7 days')").run();

  const result = db
    .prepare('INSERT INTO guest_sessions (token_hash, expires_at) VALUES (?, ?)')
    .run(hashToken(token), expiresAt);

  return { sessionId: Number(result.lastInsertRowid), issuedToken: token };
}

/** Set the guest cookie. Safe to call only when a token was just issued. */
export function setGuestCookie(res: Response, token: string): void {
  res.cookie(GUEST_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    // Not `secure` in development: the dev server runs over plain HTTP, and a
    // `secure` cookie would simply never be stored there. In production it is
    // essential, so it follows the same flag as the JWT secret handling.
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: COOKIE_MAX_AGE_SECONDS * 1000,
  });
}

/**
 * Attach the guest session to the response, issuing a cookie if there was none.
 *
 * Separate from `setGuestCookie` so a read-only endpoint can identify a session
 * without creating one: only endpoints that actually need continuity call this.
 */
export function attachGuestSession(
  db: Database.Database,
  req: Request,
  res: Response,
): number {
  const { sessionId, issuedToken } = ensureGuestSession(db, req);
  if (issuedToken) {
    setGuestCookie(res, issuedToken);
  }

  return sessionId;
}
