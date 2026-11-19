import { Router, type Request, type Response } from 'express';

import { db } from '../db.js';
import { findApprovedFarmById, listApprovedFarms } from '../repositories/farms.js';

/**
 * Public client endpoints (`C1-F1`, `C1-F2`).
 * These are intentionally unauthenticated: visitors may browse the map and
 * storefronts without an account. Only `APPROVED` farms are exposed.
 */
export const clientRouter = Router();

clientRouter.get('/farms', (_req: Request, res: Response) => {
  res.json({ farms: listApprovedFarms(db) });
});

clientRouter.get('/farms/:id', (req: Request, res: Response) => {
  const id = Number(req.params.id);

  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: 'BAD_REQUEST', message: 'Invalid farm id.' });
    return;
  }

  const farm = findApprovedFarmById(db, id);

  if (!farm) {
    // Same answer for "does not exist" and "not approved": a pending
    // storefront must not be discoverable through this endpoint (`C3-F1`).
    res.status(404).json({ error: 'NOT_FOUND', message: 'Farm not found.' });
    return;
  }

  res.json({ farm });
});
