/**
 * Dev-only helper: mint a JWT for an existing account so protected routes can be
 * exercised with curl before the `/api/auth/*` routes land (T1.3).
 *
 *   npm run token -- clara@example.ch
 */
import { db } from '../src/db.js';
import { findUserByEmail } from '../src/repositories/users.js';
import { signToken } from '../src/services/jwt.js';

const email = process.argv[2];

if (!email) {
  console.error('Usage: npm run token -- <email>');
  process.exit(1);
}

const user = findUserByEmail(db, email);

if (!user) {
  console.error(`No account found for ${email}`);
  process.exit(1);
}

// Print only the token so it can be captured by $(...).
console.log(signToken(user));
