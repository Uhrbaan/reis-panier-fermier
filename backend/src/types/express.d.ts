import type { AuthUser } from './models.js';

declare global {
  namespace Express {
    interface Request {
      /** Set by the `requireAuth` middleware; undefined on public routes. */
      user?: AuthUser;
    }
  }
}

export {};
