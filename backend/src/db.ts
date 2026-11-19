import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

import { DB_PATH } from './config/env.js';

/**
 * SQLite schema for PanierFermier.
 * Contract-bound: mirrors `specs/design.md` §3 verbatim (table and column names,
 * status enums, CHECK constraints). Any change here must be reflected in the
 * design specification first.
 *
 * Deliberate omissions, enforced by the requirements:
 *  - `users` has **no** address / city / latitude / longitude column (`C1-NF1`).
 *  - `products` has **no** `stock` / `quantity_available` column (`C2-F3`):
 *    availability is negotiated per basket (`C2-F5`), not tracked as inventory.
 *  - `farms.payment_methods` stays a JSON array text column so an
 *    `ONLINE_ESCROW` mode can be added later without a migration (`ADR-01`).
 */
const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('CLIENT', 'FARMER', 'ADMIN'))
);

CREATE TABLE IF NOT EXISTS farms (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id INTEGER NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  address TEXT NOT NULL,
  latitude REAL NOT NULL,
  longitude REAL NOT NULL,
  banner_url TEXT,
  opening_hours TEXT NOT NULL,
  payment_methods TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING_APPROVAL' CHECK(status IN ('PENDING_APPROVAL', 'APPROVED', 'REJECTED'))
);

CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  farm_id INTEGER NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  unit TEXT NOT NULL,
  unit_price REAL NOT NULL CHECK(unit_price >= 0)
);

CREATE TABLE IF NOT EXISTS baskets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL REFERENCES users(id),
  farm_id INTEGER NOT NULL REFERENCES farms(id),
  payment_method TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING_FARMER' CHECK(status IN ('PENDING_FARMER', 'OFFER_PROPOSED', 'CONFIRMED', 'REJECTED')),
  total_amount REAL NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS basket_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  basket_id INTEGER NOT NULL REFERENCES baskets(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id),
  quantity INTEGER NOT NULL CHECK(quantity > 0),
  unit_price_snapshot REAL NOT NULL,
  removed_by_farmer INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  message TEXT NOT NULL,
  basket_id INTEGER REFERENCES baskets(id),
  is_read INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Indexes: keep the public approved-farm listing fast (C2-NF1, map load) and
-- the per-owner / per-user lookups constant-ish time.
CREATE INDEX IF NOT EXISTS idx_farms_status ON farms(status);
CREATE INDEX IF NOT EXISTS idx_farms_owner_id ON farms(owner_id);
CREATE INDEX IF NOT EXISTS idx_products_farm_id ON products(farm_id);
CREATE INDEX IF NOT EXISTS idx_baskets_client_id ON baskets(client_id);
CREATE INDEX IF NOT EXISTS idx_baskets_farm_id ON baskets(farm_id);
CREATE INDEX IF NOT EXISTS idx_basket_items_basket_id ON basket_items(basket_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_basket_id ON notifications(basket_id);
`;

function resolveDatabasePath(): string {
  if (DB_PATH === ':memory:') {
    return DB_PATH;
  }
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  return DB_PATH;
}

export function createDatabase(databasePath: string = resolveDatabasePath()): Database.Database {
  const connection = new Database(databasePath);

  // Referential integrity is not enabled by default in SQLite: without this,
  // `owner_id` / `farm_id` / `basket_id` references would not be enforced.
  connection.pragma('foreign_keys = ON');

  if (databasePath !== ':memory:') {
    // WAL improves concurrent reads for the map / notification polling.
    connection.pragma('journal_mode = WAL');
  }

  return connection;
}

/** Create every table and index if missing. Safe to run on each boot. */
export function initializeSchema(connection: Database.Database): void {
  connection.exec(SCHEMA_SQL);
}

const db = createDatabase();
initializeSchema(db);

export { db };
export default db;
