import type Database from 'better-sqlite3';

import type { Role, UserRow } from '../types/models.js';

const USER_COLUMNS = 'id, name, email, password_hash, role';

/** Look up a user by e-mail (case-insensitive, the column is UNIQUE). */
export function findUserByEmail(db: Database.Database, email: string): UserRow | undefined {
  const row = db
    .prepare(`SELECT ${USER_COLUMNS} FROM users WHERE email = ? COLLATE NOCASE`)
    .get(email.trim());
  return row as UserRow | undefined;
}

/**
 * Look up a user by primary key. `requireAuth` re-reads the row on every
 * request so that a deleted or role-changed account loses access immediately
 * instead of keeping its privileges until the token expires.
 */
export function findUserById(db: Database.Database, id: number): UserRow | undefined {
  const row = db.prepare(`SELECT ${USER_COLUMNS} FROM users WHERE id = ?`).get(id);
  return row as UserRow | undefined;
}

export function countUsers(db: Database.Database): number {
  const row = db.prepare('SELECT COUNT(*) AS total FROM users').get() as { total: number };
  return row.total;
}

export interface NewUser {
  name: string;
  email: string;
  password_hash: string;
  role: Role;
}

export function insertUser(db: Database.Database, user: NewUser): number {
  const result = db
    .prepare('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)')
    .run(user.name, user.email, user.password_hash, user.role);
  return Number(result.lastInsertRowid);
}
