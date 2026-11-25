import { Router, type Request, type Response } from 'express';

import { db } from '../db.js';
import { optionalAuth } from '../middleware/auth.js';
import { findGuestSessionByRequest } from '../services/guestSession.js';
import {
  countUnreadNotifications,
  listNotifications,
  markNotificationRead,
  type NotificationRecipient,
} from '../services/notifications.js';
import { parseId } from '../services/validation.js';

/**
 * Notifications (`C3-F2`, `T1.4`).
 *
 * Readable by an account **or** an anonymous device session (`ADR-10`), so a
 * visitor who never registered still gets a working bell. `requireAuth` is not
 * mounted: authentication is optional, and the recipient is resolved below.
 */
export const notificationsRouter = Router();

/**
 * Resolve who is asking.
 *
 * A JWT wins when present; otherwise the guest cookie identifies the device.
 * Returns `undefined` when there is neither, which means "no notifications"
 * rather than an error: a first-time visitor has simply not ordered anything.
 */
function resolveRecipient(req: Request): NotificationRecipient | undefined {
  if (req.user) {
    return { userId: req.user.id };
  }

  const session = findGuestSessionByRequest(db, req);
  return session ? { guestSessionId: session.id } : undefined;
}

notificationsRouter.use(optionalAuth);

notificationsRouter.get('/', (req: Request, res: Response) => {
  const recipient = resolveRecipient(req);

  if (!recipient) {
    res.json({ notifications: [], unreadCount: 0 });
    return;
  }

  res.json({
    notifications: listNotifications(db, recipient),
    unreadCount: countUnreadNotifications(db, recipient),
  });
});

notificationsRouter.patch('/:id/read', (req: Request, res: Response) => {
  const notificationId = parseId(req.params.id);
  if (notificationId === undefined) {
    res.status(400).json({ error: 'BAD_REQUEST', message: 'Invalid notification id.' });
    return;
  }

  const recipient = resolveRecipient(req);
  if (!recipient) {
    res.status(404).json({ error: 'NOT_FOUND', message: 'Notification not found.' });
    return;
  }

  const updated = markNotificationRead(db, recipient, notificationId);
  if (!updated) {
    // Foreign ids and unknown ids are indistinguishable on purpose.
    res.status(404).json({ error: 'NOT_FOUND', message: 'Notification not found.' });
    return;
  }

  res.json({ unreadCount: countUnreadNotifications(db, recipient) });
});
