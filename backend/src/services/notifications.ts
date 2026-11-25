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

export interface PendingNotification {
  /** Recipient. */
  userId: number;
  message: string;
  /** Basket the notification is about, when applicable. */
  basketId: number | null;
}

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
    db.prepare('INSERT INTO notifications (user_id, message, basket_id) VALUES (?, ?, ?)').run(
      notification.userId,
      notification.message,
      notification.basketId,
    );
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

/** Notifications of the connected user, newest first. */
export function listNotifications(db: Database.Database, userId: number): NotificationDto[] {
  const rows = db
    .prepare(
      `SELECT id, user_id, message, basket_id, is_read, created_at
         FROM notifications
        WHERE user_id = ?
        ORDER BY created_at DESC, id DESC`,
    )
    .all(userId) as NotificationRow[];

  return rows.map(toNotificationDto);
}

/** Number of unread notifications, for the bell badge. */
export function countUnreadNotifications(db: Database.Database, userId: number): number {
  const row = db
    .prepare('SELECT COUNT(*) AS count FROM notifications WHERE user_id = ? AND is_read = 0')
    .get(userId) as { count: number };

  return row.count;
}

/**
 * Mark one notification as read.
 *
 * Scoped by `user_id` so a user cannot flip another user's notification; a
 * foreign id simply matches no row.
 */
export function markNotificationRead(
  db: Database.Database,
  userId: number,
  notificationId: number,
): boolean {
  const result = db
    .prepare('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?')
    .run(notificationId, userId);

  return result.changes > 0;
}
