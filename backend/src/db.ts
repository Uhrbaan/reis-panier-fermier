import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

import { DB_PATH } from './config/env.js';
import { renderDescription } from './services/markdown.js';

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
 *
 * `farms.description` keeps the producer's raw Markdown; `description_html` is
 * the sanitised rendition served to clients (`ADR-04`). Keeping both means the
 * rendition can be recomputed if the sanitiser allowlist ever changes.
 */
const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('CLIENT', 'FARMER', 'ADMIN'))
);

-- Anonymous device identity (ADR-10).
--
-- A visitor who has not signed up still needs continuity: their baskets and
-- notifications must follow them across page loads. The browser holds an
-- opaque token in an HttpOnly cookie; only its SHA-256 digest is stored here,
-- so a database leak does not hand out live sessions.
CREATE TABLE IF NOT EXISTS guest_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token_hash TEXT UNIQUE NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME NOT NULL
);

CREATE TABLE IF NOT EXISTS farms (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id INTEGER NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  description_html TEXT NOT NULL DEFAULT '',
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
  -- Exactly one of these identifies the buyer: a registered account, or the
  -- anonymous device session that placed the order (ADR-10).
  client_id INTEGER REFERENCES users(id),
  guest_session_id INTEGER REFERENCES guest_sessions(id),
  farm_id INTEGER NOT NULL REFERENCES farms(id),
  payment_method TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING_FARMER' CHECK(status IN ('PENDING_FARMER', 'OFFER_PROPOSED', 'CONFIRMED', 'REJECTED')),
  total_amount REAL NOT NULL DEFAULT 0,
  -- Short human reference quoted when contacting support about a dispute
  -- (C3-F5). Public by design: it identifies a basket but grants nothing.
  reference TEXT,
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
  -- Recipient: a registered account, or an anonymous device session (ADR-10).
  user_id INTEGER REFERENCES users(id),
  guest_session_id INTEGER REFERENCES guest_sessions(id),
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
  applyMigrations(connection);
  // Must run *after* the migration: on a database created before guest baskets
  // existed, `reference`/`access_token` do not exist yet, so indexing them in
  // `SCHEMA_SQL` would fail before the migration had a chance to add them.
  ensureGuestIndexes(connection);
}

/**
 * Unique indexes backing the guest lookup paths (`C1-F3`).
 *
 * Runs after the migrations: on a database created before guest baskets
 * existed, these columns do not exist yet when `SCHEMA_SQL` executes.
 */
function ensureGuestIndexes(connection: Database.Database): void {
  connection.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_baskets_reference ON baskets(reference);
    CREATE INDEX IF NOT EXISTS idx_baskets_guest_session ON baskets(guest_session_id);
    CREATE INDEX IF NOT EXISTS idx_notifications_guest ON notifications(guest_session_id, is_read);
  `);
}

interface TableColumn {
  name: string;
}

/**
 * Additive migrations for databases created by an earlier build.
 *
 * `CREATE TABLE IF NOT EXISTS` never alters an existing table, and the local
 * `backend/data/panierfermier.db` already exists, so new columns must be added
 * explicitly. Each step is guarded by a column check, making this idempotent
 * and safe to run on every boot.
 */
function applyMigrations(connection: Database.Database): void {
  const farmColumns = connection
    .prepare('PRAGMA table_info(farms)')
    .all() as TableColumn[];

  if (!farmColumns.some((column) => column.name === 'description_html')) {
    connection.exec("ALTER TABLE farms ADD COLUMN description_html TEXT NOT NULL DEFAULT ''");
  }

  // Backfill rows written before the rendition existed, so already-seeded farms
  // are not served with an empty description.
  backfillDescriptionHtml(connection);

  migrateBasketsForGuestSessions(connection);
  migrateNotificationsForGuestSessions(connection);
}

/**
 * Rebuild a table inside a transaction with foreign keys temporarily disabled.
 *
 * `CREATE TABLE IF NOT EXISTS` cannot change an existing table, and SQLite has
 * no `ALTER TABLE ... ALTER COLUMN ... DROP NOT NULL`, so the only portable way
 * to relax a constraint or drop a column is to rebuild:
 *
 *   1. `foreign_keys = OFF` — otherwise dropping the table would cascade into
 *      its dependants;
 *   2. create the replacement, copy the rows, drop the original, rename;
 *   3. `PRAGMA foreign_key_check` afterwards, to prove nothing was orphaned;
 *   4. `foreign_keys = ON` again.
 *
 * SQLite cannot toggle that pragma inside a transaction, hence the ordering.
 */
function rebuildTable(
  connection: Database.Database,
  statements: string[],
): void {
  connection.pragma('foreign_keys = OFF');

  try {
    connection.exec(`BEGIN;\n${statements.join('\n')}\nCOMMIT;`);

    const orphans = connection.prepare('PRAGMA foreign_key_check').all();
    if (orphans.length > 0) {
      throw new Error(
        `migration left ${orphans.length} orphaned row(s); refusing to continue`,
      );
    }
  } finally {
    connection.pragma('foreign_keys = ON');
  }
}

/**
 * Move baskets from the link-based guest model to the cookie-based one (ADR-10).
 *
 * Two changes at once, because both need the same rebuild: `guest_session_id`
 * replaces `access_token`, and `client_id` must stay nullable. The access
 * tokens are dropped deliberately: the guest link was removed in favour of the
 * device cookie, so the values have no reader left.
 */
function migrateBasketsForGuestSessions(connection: Database.Database): void {
  const columns = connection.prepare('PRAGMA table_info(baskets)').all() as Array<
    TableColumn & { notnull: number }
  >;

  const clientId = columns.find((column) => column.name === 'client_id');
  const hasGuestSession = columns.some((column) => column.name === 'guest_session_id');
  const hasAccessToken = columns.some((column) => column.name === 'access_token');

  if (clientId && clientId.notnull === 0 && hasGuestSession && !hasAccessToken) {
    return;
  }

  rebuildTable(connection, [
    `CREATE TABLE baskets_new (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       client_id INTEGER REFERENCES users(id),
       guest_session_id INTEGER REFERENCES guest_sessions(id),
       farm_id INTEGER NOT NULL REFERENCES farms(id),
       payment_method TEXT NOT NULL,
       status TEXT NOT NULL DEFAULT 'PENDING_FARMER' CHECK(status IN ('PENDING_FARMER', 'OFFER_PROPOSED', 'CONFIRMED', 'REJECTED')),
       total_amount REAL NOT NULL DEFAULT 0,
       reference TEXT,
       created_at DATETIME DEFAULT CURRENT_TIMESTAMP
     );`,
    `INSERT INTO baskets_new (id, client_id, farm_id, payment_method, status, total_amount, reference, created_at)
       SELECT id, client_id, farm_id, payment_method, status, total_amount, reference, created_at FROM baskets;`,
    'DROP TABLE baskets;',
    'ALTER TABLE baskets_new RENAME TO baskets;',
    'CREATE INDEX IF NOT EXISTS idx_baskets_client_id ON baskets(client_id);',
    'CREATE INDEX IF NOT EXISTS idx_baskets_farm_id ON baskets(farm_id);',
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_baskets_reference ON baskets(reference);',
  ]);
}

/**
 * Let notifications address an anonymous device session (ADR-10).
 *
 * `user_id` was `NOT NULL`, so a guest had nobody to notify and the bell was
 * useless to exactly the visitors we just made first-class. Dropping the
 * constraint again requires a rebuild.
 */
function migrateNotificationsForGuestSessions(connection: Database.Database): void {
  const columns = connection.prepare('PRAGMA table_info(notifications)').all() as Array<
    TableColumn & { notnull: number }
  >;

  const userId = columns.find((column) => column.name === 'user_id');
  const hasGuestSession = columns.some((column) => column.name === 'guest_session_id');

  if (userId && userId.notnull === 0 && hasGuestSession) {
    return;
  }

  rebuildTable(connection, [
    `CREATE TABLE notifications_new (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       user_id INTEGER REFERENCES users(id),
       guest_session_id INTEGER REFERENCES guest_sessions(id),
       message TEXT NOT NULL,
       basket_id INTEGER REFERENCES baskets(id),
       is_read INTEGER NOT NULL DEFAULT 0,
       created_at DATETIME DEFAULT CURRENT_TIMESTAMP
     );`,
    `INSERT INTO notifications_new (id, user_id, message, basket_id, is_read, created_at)
       SELECT id, user_id, message, basket_id, is_read, created_at FROM notifications;`,
    'DROP TABLE notifications;',
    'ALTER TABLE notifications_new RENAME TO notifications;',
    'CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications(user_id, is_read);',
    'CREATE INDEX IF NOT EXISTS idx_notifications_basket_id ON notifications(basket_id);',
  ]);
}

/**
 * Recompute `description_html` for any farm whose rendition is missing.
 *
 * `services/markdown.ts` has no database dependency, so this import cannot
 * create a cycle.
 */
function backfillDescriptionHtml(connection: Database.Database): void {
  const rows = connection
    .prepare("SELECT id, description FROM farms WHERE description_html = '' AND description <> ''")
    .all() as Array<{ id: number; description: string }>;

  if (rows.length === 0) {
    return;
  }

  const update = connection.prepare('UPDATE farms SET description_html = ? WHERE id = ?');
  const backfill = connection.transaction(() => {
    for (const row of rows) {
      update.run(renderDescription(row.description), row.id);
    }
  });

  backfill();
}

const db = createDatabase();
initializeSchema(db);

export { db };
export default db;
