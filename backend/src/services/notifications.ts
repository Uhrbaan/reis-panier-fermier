import type Database from 'better-sqlite3';

import type { NotificationRow } from '../types/models.js';

/**
 * Extensible notification delivery (`C3-F2`).
 *
 * `ADR-05`: notifications are modelled as a channel interface so e-mail (or
 * push) can be plugged in later without touching the basket controllers. Today
 * the only registered channel is the in-app bell persisted in SQLite.
 */

/** A delivery backend. Implementations must be side-effect free on failure. */
export interface NotificationChannel {
  readonly name: string;
  deliver(db: Database.Database, notification: PendingNotification): void;
}

/**
 * A recipient is either a registered account or an anonymous device session
 * (ADR-10). Exactly one of the two is set.
 */
export type NotificationRecipient =
  | { userId: number; guestSessionId?: never }
  | { guestSessionId: number; userId?: never };

export type PendingNotification = NotificationRecipient & {
  message: string;
  /** Basket the notification is about, when applicable. */
  basketId: number | null;
};

/**
 * Internal bell: persists the notification so the recipient can read it later.
 *
 * This is the only channel in A2 and the source of truth for the API, so it
 * always runs first. It uses the caller's `db` handle, which means it joins the
 * surrounding `db.transaction(...)` — a notification is never written for a
 * basket mutation that then rolls back.
 */
export class InAppChannel implements NotificationChannel {
  readonly name = 'in-app';

  deliver(db: Database.Database, notification: PendingNotification): void {
    const userId = 'userId' in notification ? notification.userId : null;
    const guestSessionId =
      'guestSessionId' in notification ? notification.guestSessionId : null;

    db.prepare(
      `INSERT INTO notifications (user_id, guest_session_id, message, basket_id)
         VALUES (?, ?, ?, ?)`,
    ).run(userId, guestSessionId, notification.message, notification.basketId);
  }
}

export class NotificationService {
  private readonly channels: NotificationChannel[];

  constructor(channels: NotificationChannel[] = [new InAppChannel()]) {
    this.channels = channels;
  }

  /**
   * Deliver to every registered channel.
   *
   * The in-app channel is mandatory (it backs `GET /api/notifications`), so a
   * missing one is a programming error rather than a configuration choice.
   */
  notify(db: Database.Database, notification: PendingNotification): void {
    for (const channel of this.channels) {
      channel.deliver(db, notification);
    }
  }
}

export const notificationService = new NotificationService();

export interface NotificationDto {
  id: number;
  message: string;
  basketId: number | null;
  isRead: boolean;
  createdAt: string;
}

function toNotificationDto(row: NotificationRow): NotificationDto {
  return {
    id: row.id,
    message: row.message,
    basketId: row.basket_id,
    isRead: row.is_read === 1,
    createdAt: row.created_at,
  };
}

/**
 * SQL predicate + parameters selecting one recipient's notifications.
 *
 * Shared by the three read paths so an account and an anonymous device session
 * are handled by exactly the same code, and cannot drift apart.
 */
function recipientFilter(recipient: NotificationRecipient): {
  clause: string;
  params: [number];
} {
  return 'userId' in recipient
    ? { clause: 'user_id = ?', params: [recipient.userId] }
    : { clause: 'guest_session_id = ?', params: [recipient.guestSessionId] };
}

/** Notifications of the recipient, newest first. */
export function listNotifications(
  db: Database.Database,
  recipient: NotificationRecipient,
): NotificationDto[] {
  const { clause, params } = recipientFilter(recipient);

  const rows = db
    .prepare(
      `SELECT id, user_id, message, basket_id, is_read, created_at
         FROM notifications
        WHERE ${clause}
        ORDER BY created_at DESC, id DESC`,
    )
    .all(...params) as NotificationRow[];

  return rows.map(toNotificationDto);
}

/** Number of unread notifications, for the bell badge. */
export function countUnreadNotifications(
  db: Database.Database,
  recipient: NotificationRecipient,
): number {
  const { clause, params } = recipientFilter(recipient);

  const row = db
    .prepare(`SELECT COUNT(*) AS count FROM notifications WHERE ${clause} AND is_read = 0`)
    .get(...params) as { count: number };

  return row.count;
}

/**
 * Mark one notification as read.
 *
 * Scoped by the recipient so nobody can flip someone else's notification; a
 * foreign id simply matches no row.
 */
export function markNotificationRead(
  db: Database.Database,
  recipient: NotificationRecipient,
  notificationId: number,
): boolean {
  const { clause, params } = recipientFilter(recipient);

  const result = db
    .prepare(`UPDATE notifications SET is_read = 1 WHERE id = ? AND ${clause}`)
    .run(notificationId, ...params);

  return result.changes > 0;
}
