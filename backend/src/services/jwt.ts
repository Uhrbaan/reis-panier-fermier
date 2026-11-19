import jwt from 'jsonwebtoken';

import { JWT_EXPIRES_IN, JWT_SECRET } from '../config/env.js';
import type { AuthUser, Role } from '../types/models.js';

export interface JwtPayload {
  /** User id (standard `sub` claim, serialised as a string by the JWT spec). */
  sub: string;
  email: string;
  role: Role;
}

export interface AuthenticatedToken extends JwtPayload {
  id: number;
}

export interface SignableUser {
  id: number;
  email: string;
  role: Role;
}

export function signToken(user: SignableUser): string {
  const payload: JwtPayload = {
    sub: String(user.id),
    email: user.email,
    role: user.role,
  };
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN as NonNullable<jwt.SignOptions['expiresIn']>,
  });
}

/**
 * Verify signature and expiry, then normalise the payload.
 * Throws if the token is invalid, expired, or does not carry a numeric subject.
 */
export function verifyToken(token: string): AuthenticatedToken {
  const decoded = jwt.verify(token, JWT_SECRET);

  if (typeof decoded === 'string') {
    throw new Error('Unexpected JWT payload type');
  }

  const { sub, email, role } = decoded as jwt.JwtPayload & Partial<JwtPayload>;
  const id = Number(sub);

  if (!Number.isInteger(id) || id <= 0) {
    throw new Error('Invalid JWT subject');
  }

  return { id, sub: String(id), email: email ?? '', role: role as Role };
}

/** Extract the token from an `Authorization: Bearer <token>` header. */
export function extractBearerToken(headerValue: string | undefined): string | null {
  if (!headerValue) {
    return null;
  }
  const [scheme, ...rest] = headerValue.trim().split(/\s+/);
  if (!scheme || scheme.toLowerCase() !== 'bearer' || rest.length !== 1) {
    return null;
  }
  return rest[0] ?? null;
}

export type { AuthUser };
