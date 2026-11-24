import { Router, type Request, type Response } from 'express';

import { db } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { listPendingFarms, setFarmStatus } from '../repositories/farms.js';
import { parseId } from '../services/validation.js';
import { FARM_STATUSES, type FarmStatus } from '../types/models.js';

/**
 * Administration (`C3-F1`) — deliberately minimal for now.
 *
 * An admin only needs to see what is waiting for validation and to approve or
 * reject it. Anything richer (audit trail, reasons, bulk actions) is out of
 * scope for the prototype.
 */
export const adminRouter = Router();

adminRouter.use(requireAuth, requireRole('ADMIN'));

/** Farms awaiting validation, oldest first. */
adminRouter.get('/farms/pending', (_req: Request, res: Response) => {
  res.json({ farms: listPendingFarms(db) });
});

/**
 * Approve (`APPROVED`) or reject (`REJECTED`) a storefront.
 *
 * Only those two transitions are allowed: `PENDING_APPROVAL` is the entry
 * state, and a rejected farm returns to the queue by itself when the producer
 * saves a correction (`C2-F4`).
 */
adminRouter.patch('/farms/:id/status', (req: Request, res: Response) => {
  const farmId = parseId(req.params.id);
  if (farmId === undefined) {
    res.status(400).json({ error: 'BAD_REQUEST', message: 'Invalid farm id.' });
    return;
  }

  const requested = (req.body as { status?: unknown }).status;
  const allowed: FarmStatus[] = ['APPROVED', 'REJECTED'];

  if (typeof requested !== 'string' || !(FARM_STATUSES as readonly string[]).includes(requested)) {
    res.status(400).json({
      error: 'BAD_REQUEST',
      message: `status must be one of: ${FARM_STATUSES.join(', ')}.`,
    });
    return;
  }

  if (!allowed.includes(requested as FarmStatus)) {
    res.status(400).json({
      error: 'BAD_REQUEST',
      message: 'Only APPROVED and REJECTED can be set by an administrator.',
    });
    return;
  }

  const updated = setFarmStatus(db, farmId, requested as FarmStatus);
  if (!updated) {
    res.status(404).json({ error: 'NOT_FOUND', message: 'Farm not found.' });
    return;
  }

  res.json({ id: farmId, status: requested });
});
