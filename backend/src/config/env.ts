import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** Absolute path to the `backend/` directory (parent of `src/`). */
export const BACKEND_ROOT = path.resolve(HERE, '..', '..');

export const NODE_ENV = process.env.NODE_ENV ?? 'development';
export const IS_PRODUCTION = NODE_ENV === 'production';

/**
 * SQLite database location. Defaults to `backend/data/panierfermier.db`.
 * Use `DB_PATH=:memory:` in tests to get a throwaway in-memory database.
 */
export const DB_PATH = process.env.DB_PATH ?? path.join(BACKEND_ROOT, 'data', 'panierfermier.db');

export const PORT = Number(process.env.PORT ?? 3000);

const DEV_JWT_SECRET = 'dev-only-insecure-secret-change-me';

const envSecret = process.env.JWT_SECRET;
if (!envSecret && IS_PRODUCTION) {
  throw new Error('JWT_SECRET environment variable is required when NODE_ENV=production');
}
if (!envSecret) {
  console.warn('[config] JWT_SECRET is not set — falling back to an insecure development secret.');
}

export const JWT_SECRET = envSecret ?? DEV_JWT_SECRET;

/** Token lifetime, e.g. `8h`. Must be a valid `jsonwebtoken` duration string. */
export const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN ?? '8h';
