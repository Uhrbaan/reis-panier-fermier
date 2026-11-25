import { Router, type Request, type Response } from 'express';

import { db } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import {
  countUnreadNotifications,
  listNotifications,
  markNotificationRead,
} from '../services/notifications.js';
import { parseId } from '../services/validation.js';

/**
 * Notifications (`C3-F2`, `T1.4`).
 *
 * Any authenticated user may read their own notifications: clients, producers
 * and administrators all receive them, so this router is not role-restricted —
 * every query is scoped by `req.user.id` instead.
 */
export const notificationsRouter = Router();

notificationsRouter.use(requireAuth);

notificationsRouter.get('/', (req: Request, res: Response) => {
  const userId = req.user!.id;

  res.json({
    notifications: listNotifications(db, userId),
    unreadCount: countUnreadNotifications(db, userId),
  });
});

notificationsRouter.patch('/:id/read', (req: Request, res: Response) => {
  const notificationId = parseId(req.params.id);
  if (notificationId === undefined) {
    res.status(400).json({ error: 'BAD_REQUEST', message: 'Invalid notification id.' });
    return;
  }

  const updated = markNotificationRead(db, req.user!.id, notificationId);
  if (!updated) {
    // Foreign ids and unknown ids are indistinguishable on purpose.
    res.status(404).json({ error: 'NOT_FOUND', message: 'Notification not found.' });
    return;
  }

  res.json({ unreadCount: countUnreadNotifications(db, req.user!.id) });
});
