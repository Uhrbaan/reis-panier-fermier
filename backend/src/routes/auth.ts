import { Router, type Request, type Response } from 'express';

import { db } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { emailExists, findUserByEmail, insertUser } from '../repositories/users.js';
import { hashPassword, verifyPassword } from '../services/passwords.js';
import { signToken } from '../services/jwt.js';
import { toPublicUser } from '../types/models.js';
import { LIMITS, requiredText, type ValidationResult } from '../services/validation.js';

/**
 * Authentication (`T1.3`).
 *
 * Two endpoints only: register and login. Both return the same shape
 * (`{ token, user }`) so the SPA has a single way to open a session.
 *
 * Registration deliberately refuses to create `ADMIN` accounts: the only admin
 * is the seeded one. Letting the public choose its own role would defeat the
 * whole role-isolation design (`ADR-07`).
 *
 * The JWT payload stays minimal — `sub`, `email`, `role` — because `requireAuth`
 * re-reads the user from SQLite on every request anyway (`C1-NF1`).
 */
export const authRouter = Router();

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;
/** bcrypt silently truncates beyond 72 bytes, so reject early instead. */
const MAX_PASSWORD_LENGTH = 72;

/** Roles a visitor may self-assign. `ADMIN` is intentionally absent. */
const SELF_REGISTERABLE_ROLES = ['CLIENT', 'FARMER'] as const;
type SelfRegisterableRole = (typeof SELF_REGISTERABLE_ROLES)[number];

function badRequest(res: Response, message: string): void {
  res.status(400).json({ error: 'BAD_REQUEST', message });
}

function takeOr400<T>(res: Response, result: ValidationResult<T>): T | undefined {
  if (!result.ok) {
    badRequest(res, result.message);
    return undefined;
  }
  return result.value;
}

function parseEmail(raw: unknown): ValidationResult<string> {
  const text = requiredText(raw, 'email', LIMITS.email);
  if (!text.ok) return text;

  // Normalise so `Marc@Example.ch` and `marc@example.ch` cannot both register.
  const email = text.value.toLowerCase();
  if (!EMAIL_PATTERN.test(email)) {
    return { ok: false, message: 'Enter a valid e-mail address.' };
  }

  return { ok: true, value: email };
}

function parsePassword(raw: unknown): ValidationResult<string> {
  if (typeof raw !== 'string' || raw.length === 0) {
    return { ok: false, message: 'password is required.' };
  }

  if (raw.length < MIN_PASSWORD_LENGTH) {
    return {
      ok: false,
      message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
    };
  }

  if (raw.length > MAX_PASSWORD_LENGTH) {
    return {
      ok: false,
      message: `Password must be at most ${MAX_PASSWORD_LENGTH} characters.`,
    };
  }

  return { ok: true, value: raw };
}

function parseRole(raw: unknown): ValidationResult<SelfRegisterableRole> {
  // Default to CLIENT so a minimal form still works.
  if (raw === undefined || raw === '') {
    return { ok: true, value: 'CLIENT' };
  }

  if (typeof raw !== 'string' || !SELF_REGISTERABLE_ROLES.includes(raw as SelfRegisterableRole)) {
    return {
      ok: false,
      message: `role must be one of: ${SELF_REGISTERABLE_ROLES.join(', ')}.`,
    };
  }

  return { ok: true, value: raw as SelfRegisterableRole };
}

/** Open a session for an existing user. */
authRouter.post('/login', (req: Request, res: Response) => {
  const body = req.body as Record<string, unknown>;

  const email = parseEmail(body.email);
  if (!email.ok) {
    // Do not reveal whether the address exists: same message as a wrong password.
    res.status(401).json({ error: 'UNAUTHORIZED', message: 'Invalid e-mail or password.' });
    return;
  }

  const password = typeof body.password === 'string' ? body.password : '';
  const user = findUserByEmail(db, email.value);

  if (!user || !verifyPassword(password, user.password_hash)) {
    res.status(401).json({ error: 'UNAUTHORIZED', message: 'Invalid e-mail or password.' });
    return;
  }

  res.json({ token: signToken(user), user: toPublicUser(user) });
});

/** Create an account and open a session immediately. */
authRouter.post('/register', (req: Request, res: Response) => {
  const body = req.body as Record<string, unknown>;

  const name = takeOr400(res, requiredText(body.name, 'name', LIMITS.name));
  if (name === undefined) return;

  const email = takeOr400(res, parseEmail(body.email));
  if (email === undefined) return;

  const password = takeOr400(res, parsePassword(body.password));
  if (password === undefined) return;

  const role = takeOr400(res, parseRole(body.role));
  if (role === undefined) return;

  if (emailExists(db, email)) {
    res.status(409).json({
      error: 'CONFLICT',
      message: 'An account with this e-mail already exists.',
    });
    return;
  }

  const userId = insertUser(db, {
    name,
    email,
    password_hash: hashPassword(password),
    role,
  });

  const user = findUserByEmail(db, email);
  if (!user) {
    // Should be impossible; surfaced rather than returning a half-built session.
    res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Account creation failed.' });
    return;
  }

  res.status(201).json({ token: signToken(user), user: toPublicUser(user), id: userId });
});

/**
 * Return the caller's own profile.
 *
 * Kept here so the SPA can validate a stored token on boot instead of trusting
 * `localStorage` (which is only a cache; `requireAuth` is the real authority).
 */
authRouter.get('/me', requireAuth, (req: Request, res: Response) => {
  res.json({ user: req.user });
});
