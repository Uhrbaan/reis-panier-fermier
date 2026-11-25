import { Router, type Request, type Response } from 'express';

import { IS_PRODUCTION } from '../config/env.js';
import {
  DEMO_PASSWORD,
  SEED_ADMIN,
  SEED_CLIENT,
  SEED_FARM_USERS,
} from '../seed.js';
import type { Role } from '../types/models.js';

/**
 * Demo shortcut endpoints — **development only** (`T1.3`).
 *
 * The login form calls this to offer one-click sign-in for the seeded accounts,
 * which makes manual testing of the three roles far quicker. It exists to avoid
 * the alternative, which is worse: hardcoding these credentials in
 * `frontend/src` would ship them inside the public JavaScript bundle of any
 * production build.
 *
 * The guard is `IS_PRODUCTION` (`NODE_ENV=production`), not a client-side flag,
 * so disabling the panel is not something a browser can undo.
 */

export interface DemoAccount {
  role: Role;
  name: string;
  email: string;
  password: string;
  /** What this account is useful for when demoing. */
  hint: string;
}

/** Rebuild the seeded account list from the same constants the seeder uses. */
function demoAccounts(): DemoAccount[] {
  const accounts: DemoAccount[] = [
    {
      role: 'ADMIN',
      name: SEED_ADMIN.name,
      email: SEED_ADMIN.email,
      password: DEMO_PASSWORD,
      hint: 'Valide les fermes en attente (C3-F1).',
    },
    {
      role: 'CLIENT',
      name: SEED_CLIENT.name,
      email: SEED_CLIENT.email,
      password: DEMO_PASSWORD,
      hint: 'Compose et suit des paniers (C1-F3, C1-F4).',
    },
  ];

  for (const farmer of SEED_FARM_USERS) {
    accounts.push({
      role: 'FARMER',
      name: farmer.name,
      email: farmer.email,
      password: DEMO_PASSWORD,
      hint: `${farmer.farm.name} — ${farmer.farm.status === 'APPROVED' ? 'ferme approuvée' : 'en attente de validation'}.`,
    });
  }

  return accounts;
}

export const demoRouter = Router();

demoRouter.get('/accounts', (_req: Request, res: Response) => {
  if (IS_PRODUCTION) {
    // Unreachable when the router is mounted conditionally in `server.ts`, but
    // kept as a second lock so a future mount change cannot expose it silently.
    res.status(404).json({ error: 'NOT_FOUND', message: 'Not found.' });
    return;
  }

  res.json({ accounts: demoAccounts() });
});
