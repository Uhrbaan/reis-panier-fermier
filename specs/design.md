# Technical Design Specification — PanierFermier

## 1. Architecture & Tech Stack
* **Frontend (`frontend/`):** **Vue 3** SPA (Composition API, TypeScript), **Tailwind CSS**, **Vue Router**, **MapLibre GL JS** (OpenStreetMap tiles).
* **Backend (`backend/`):** **Node.js**, **Express**, **TypeScript**, **SQLite** (`better-sqlite3`), **Multer** (local image upload), **bcrypt** + **jsonwebtoken** (authentication).
* **Tests (`tests/`):** **Vitest** + **Supertest** (unit and API/NFR integration tests) and **Playwright** (E2E tests).

> **Note (T1.2):** The actual repository directories are `backend/` and `frontend/` (not `server/` / `client/`). Server code lives in `backend/src/`.

## 2. Key Design Decisions (ADRs)

1. **ADR-01 — Exclusion of Stripe & escrow:** Online payments are removed from the A2 scope. The `Basket` model keeps the `payment_method` field (`CASH`, `TWINT_FARM`, `CARD_FARM`) so that an `ONLINE_ESCROW` mode can be added later without breaking the schema.
2. **ADR-02 — Server-side geocoding:** When a producer submits or updates their farm address (`C2-F1`, `C2-F4`), the backend queries the free Swiss **geo.admin.ch** API (`SearchServer`) with a fallback to **Nominatim (OpenStreetMap)** to convert the address into `(latitude, longitude)` before inserting it into the database. Results outside the Swiss bounds are rejected so a bad match never lands on the map.
3. **ADR-03 — Banner storage without a second database:** Images uploaded via `multipart/form-data` are written by `multer` into `backend/uploads/` and served statically under `/uploads/<filename>`. Only the relative path is stored in SQLite. Filenames are randomised and the extension is derived from the MIME type; SVG is deliberately refused as it can carry script once served from our own origin.
4. **ADR-04 — Server-side sanitised Markdown rendering:** The storefront description (`C2-F1`) is typed in Markdown by the producer. The server converts it to HTML (`marked`) then sanitises it (`sanitize-html`, tag allowlist) **at the write boundary**, and stores both forms: `farms.description` (raw Markdown, source of truth) and `farms.description_html` (sanitised rendition served to clients). Sanitising at the write boundary guarantees that *every* downstream consumer (farm page, map popup, admin screen, future mobile client) receives safe HTML without having to think about it, and avoids a Markdown parse on every read (`C2-NF1`). The raw Markdown is retained so the rendition can be recomputed if the allowlist evolves. On the frontend, a client-side renderer (`marked` + `DOMPurify`) remains **only** for the live preview of unsaved text in the editor, and it is lazy-loaded so public visitors never download those dependencies.
5. **ADR-05 — Extensible notification service (Strategy / Observer Pattern):** The `NotificationService` class writes notifications into the `notifications` SQLite table (internal bell, `C3-F2`), while exposing a `NotificationChannel` interface allowing an e-mail channel (`EmailChannel`) to be registered later without modifying the order controllers.
6. **ADR-06 — Unified lightweight authentication:** A single `users` table handles the three roles (`CLIENT`, `FARMER`, `ADMIN`) via JWT. No address or GPS field exists on `users` (`C1-NF1`).
7. **ADR-07 — Server-side authorisation only:** `requireAuth` validates the JWT signature and expiry then **re-reads the user from the database** on every request (the role carried by the token is never treated as truth); `requireRole('FARMER' | 'ADMIN')` then restricts access. Vue Router guards are only a UI convenience and never constitute the security boundary. All producer writes are additionally filtered in SQL by `owner_id = req.user.id`.
8. **ADR-08 — Buying is not a role:** placing a basket requires an authenticated user, not the `CLIENT` role. Producers and administrators buy food too, so gating checkout on `role = 'CLIENT'` was an artificial restriction. The single combination that makes no sense is ordering from one's own farm, which `createBasket` refuses with `SELF_ORDER` (`409`). `CLIENT` therefore remains a label for "registered to buy", not a permission.
9. **ADR-10 — Anonymous device identity via a session cookie:** ordering does not require an account (`C1-F3`). Requiring an e-mail address to buy is friction users do not expect, and nothing in the flow needs an identity, so an account becomes a convenience (e-mail reminders) rather than a gate. The first order issues an **opaque 32-byte token** in an `HttpOnly`, `SameSite=Lax` cookie valid 30 days, and only its SHA-256 digest is stored in `guest_sessions`. That cookie is what makes the basket and the notification bell follow the visitor across page loads.

   Why a cookie and not the previous access link: a link puts continuity on the user ("keep this link"), and losing it makes the basket unreachable — a worse experience than the account it replaced. Why an opaque token and not the basket id in the cookie: if the cookie *were* the id, editing `basket_id=1` to `2` would read someone else's order. `HttpOnly` keeps the token out of reach of injected scripts and `SameSite=Lax` blocks cross-site form posts. 30 days is deliberately generous: nobody waits that long for fresh produce, so cross-device sync and expiry are not worth the complexity here. No e-mail is collected from guests: with no e-mail channel it would be personal data with no purpose.

## 3. SQLite Database Schema

**Implementation:** `backend/src/db.ts` (schema + indexes), `backend/src/seed.ts` (demo dataset), `backend/src/middleware/auth.ts` (JWT). Default database: `backend/data/panierfermier.db` (overridable via `DB_PATH`, `:memory:` supported). `foreign_keys = ON` is enabled on every connection and `journal_mode = WAL` in file mode.

**Indexes:** `farms(status)` (public listing of approved farms, `C2-NF1`), `farms(owner_id)`, `products(farm_id)`, `baskets(client_id)`, `baskets(farm_id)`, `basket_items(basket_id)`, `notifications(user_id, is_read)`, `notifications(basket_id)`.

```sql
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('CLIENT', 'FARMER', 'ADMIN'))
);

CREATE TABLE farms (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id INTEGER NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  description TEXT NOT NULL,          -- raw Markdown typed by the producer (source of truth)
  description_html TEXT NOT NULL DEFAULT '', -- sanitised HTML rendition served to clients (ADR-04)
  address TEXT NOT NULL,
  latitude REAL NOT NULL,
  longitude REAL NOT NULL,
  banner_url TEXT,
  opening_hours TEXT NOT NULL,
  payment_methods TEXT NOT NULL, -- JSON array: ["CASH", "TWINT_FARM", "CARD_FARM"]
  status TEXT NOT NULL DEFAULT 'PENDING_APPROVAL' CHECK(status IN ('PENDING_APPROVAL', 'APPROVED', 'REJECTED'))
);

CREATE TABLE products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  farm_id INTEGER NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  unit TEXT NOT NULL,
  unit_price REAL NOT NULL CHECK(unit_price >= 0)
);

CREATE TABLE baskets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  -- Exactly one of these identifies the buyer: a registered account, or the
  -- anonymous device session that placed the order (ADR-10).
  client_id INTEGER REFERENCES users(id),
  guest_session_id INTEGER REFERENCES guest_sessions(id),
  farm_id INTEGER NOT NULL REFERENCES farms(id),
  payment_method TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING_FARMER' CHECK(status IN ('PENDING_FARMER', 'OFFER_PROPOSED', 'CONFIRMED', 'REJECTED')),
  total_amount REAL NOT NULL DEFAULT 0,
  -- Short public reference quoted when contacting support about a dispute
  -- (C3-F5). Public by design: it identifies a basket but grants nothing.
  reference TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Anonymous device identity (ADR-10). Only the digest is stored, so a
-- database leak hands out no live session.
CREATE TABLE guest_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token_hash TEXT UNIQUE NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME NOT NULL
);

CREATE TABLE basket_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  basket_id INTEGER NOT NULL REFERENCES baskets(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id),
  quantity INTEGER NOT NULL CHECK(quantity > 0),
  unit_price_snapshot REAL NOT NULL,
  removed_by_farmer INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  -- Recipient: a registered account, or an anonymous device session (ADR-10).
  user_id INTEGER REFERENCES users(id),
  guest_session_id INTEGER REFERENCES guest_sessions(id),
  message TEXT NOT NULL,
  basket_id INTEGER REFERENCES baskets(id),
  is_read INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

```

### 3.1. Demo seed (`backend/src/seed.ts`)

Idempotent (no insertion if the `users` table already contains rows) and executed automatically on server start (`npm run seed` to run it standalone). Shared password: `password123`.

| Role | Email | Farm created | Status |
| :--- | :--- | :--- | :--- |
| `ADMIN` | `sophie@example.ch` | — | — |
| `CLIENT` | `clara@example.ch` | — | — |
| `FARMER` | `marc@example.ch` | Ferme des Tilleuls (Fribourg) | `APPROVED` |
| `FARMER` | `anna@example.ch` | Ferme du Vully (Sugiez) | `PENDING_APPROVAL` |

A producer owns exactly one storefront (`GET /api/farmer/farm`): the 2 required farms are therefore carried by 2 distinct `FARMER` accounts, which preserves the `owner_id = req.user.id` isolation. The `APPROVED` farm feeds the map (`C1-F1`), while the `PENDING_APPROVAL` farm demonstrates administrator validation (`C3-F1`). Products are created without any stock field (`C2-F3`).

### 3.2. JWT middlewares (`backend/src/middleware/auth.ts`)

| Middleware | Behaviour | Codes |
| :--- | :--- | :--- |
| `requireAuth` | Extracts the `Authorization: Bearer <jwt>` token, verifies signature + expiry, then reloads the user from the database. | `401` (missing/malformed header, invalid or expired token, deleted account) |
| `requireRole(...roles)` | Denies access if `req.user.role` is not among the allowed roles. Mount after `requireAuth`. | `401` (unauthenticated), `403` (insufficient role) |

The token is signed with `JWT_SECRET` (mandatory when `NODE_ENV=production`, development fallback with a warning otherwise) and expires after `JWT_EXPIRES_IN` (default `8h`). The payload contains only `sub` (id), `email` and `role`: no additional personal data (`C1-NF1`).

## 4. REST API Contract

**Error shape.** Every failure answers `{ error, message }`, where `error` is a stable machine-readable code (`BAD_REQUEST`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `INVALID_TRANSITION`, `GEOCODING_FAILED`, `INTERNAL_ERROR`) and `message` is human-readable. The SPA displays `message` (`handleResponse` in `frontend/src/api.ts`).

**`409` is the convention for a well-formed request that the current state forbids.** A basket in the wrong status, a second storefront, or deleting a product still referenced by a basket are conflicts, not client errors: the payload was valid, the transition was not.

### Basket lifecycle (`C1-F3`, `C2-F5`, `C1-F4`)

```
                 (client)                     (producer)                (client)
  [create] ──▶ PENDING_FARMER ──adjust──▶ OFFER_PROPOSED ──accept──▶ CONFIRMED
                     │                         │
                     │                         └──refuse──────────▶ REJECTED
                     └──adjust removing all lines──────────────────▶ REJECTED
```

| Transition | Endpoint | Allowed from | Result |
| :--- | :--- | :--- | :--- |
| create | `POST /api/client/baskets` | — | `PENDING_FARMER` (account **or** guest) |
| adjust | `PATCH /api/farmer/baskets/:id/adjust` | `PENDING_FARMER` | `OFFER_PROPOSED`, or `REJECTED` if no line survives |
| accept / refuse | `PATCH /api/client/baskets/:id/respond` | `OFFER_PROPOSED` | `CONFIRMED` / `REJECTED` (account **or** device session) |

Any other transition answers `409 INVALID_TRANSITION`. The guard is implemented in the SQL `WHERE` clause rather than in a read-then-write sequence, so two concurrent adjustments cannot both succeed.

**Schema migration (`ADR-10`).** Relaxing `baskets.client_id` and `notifications.user_id` to nullable cannot be done with `ALTER TABLE` in SQLite, so `db.ts` rebuilds both tables (`foreign_keys = OFF` → copy → rename → `PRAGMA foreign_key_check` → `ON`). Each is guarded by a column check and therefore runs at most once per database. The unique index on `reference` is created **after** the migration, because on a pre-guest database the column does not exist when `SCHEMA_SQL` runs.

### Authentication & Notifications (All roles)

**Auth implementation:** `backend/src/routes/auth.ts`, `frontend/src/components/AuthModal.vue`.

* `POST /api/auth/register` — Account creation (`CLIENT` or `FARMER`). **Implemented:** `201 { token, user, id }`. E-mail normalised to lowercase; password 8–72 characters (bcrypt limit); `409` if the e-mail already exists; `400` if `role` is `ADMIN` (self-assignment forbidden).
* `POST /api/auth/login` — Login returning the JWT token + user profile. **Implemented:** `200 { token, user }`, `401` with a single message whether the e-mail is unknown or the password is wrong (no account enumeration).
* `GET /api/auth/me` — Profile of the token holder. **Implemented** (`requireAuth`), lets the SPA validate a stored token on startup.
* `GET /api/notifications` — The caller's notifications plus `unreadCount` (`C3-F2`). **Implemented** (`backend/src/routes/notifications.ts`, `services/notifications.ts`). Neither role- nor login-restricted: the recipient is the account (JWT) or the anonymous device session (cookie, `ADR-10`), so a guest has a working bell. A caller with neither gets an empty list, not a `401`.
* `PATCH /api/notifications/:id/read` — Marks a notification as read. **Implemented:** `200 { unreadCount }`, `404` when the notification is unknown *or* belongs to someone else (deliberately indistinguishable).

### Client & Public area (`/api/client/*`)

* `GET /api/client/farms` — Returns all farms with `APPROVED` status (`C1-F1`). **Implemented** (`backend/src/routes/client.ts`, public, no authentication).
* `GET /api/client/farms/:id` — Details of an approved farm + its product list (`C1-F2`). **Implemented:** returns `404` if the farm does not exist or is not `APPROVED`.
* `POST /api/client/baskets` — Creates a basket request (`C1-F3`, `C3-F3`). **Implemented:** `201 { basket, reference }`. **Authentication is optional:** with a valid token the basket belongs to the account; without one it belongs to the device, and a guest session cookie is issued (`ADR-10`). No credential is returned in the body, so there is nothing for the client to store. The server never trusts client-supplied prices: it resolves each `productId` against the target farm and stores `unit_price_snapshot` itself. Errors: `400` (empty basket, duplicate product, quantity < 1 or > 999, more than 100 lines, unknown payment method, or a method the farm does not accept), `404` (unknown *or* non-approved farm — same answer), `409 SELF_ORDER` (a producer ordering from their own farm, `ADR-08`).
* `GET /api/client/baskets` — Lists the caller's baskets, newest first. **Implemented:** authentication is optional; the recipient is the account (JWT) or the anonymous device session (cookie). Reading never issues a cookie, and a visitor with neither simply gets `[]` rather than `401`.
* `PATCH /api/client/baskets/:id/respond` — Accepts (`CONFIRMED`) or refuses (`REJECTED`) an offer (`C1-F4`). **Implemented:** `200 { basket }`, `400` when `accept` is not a boolean, `404` for a foreign/unknown basket, `409 INVALID_TRANSITION` unless the basket is `OFFER_PROPOSED`.

### Producer area (`/api/farmer/*` — `FARMER` role required)

**Implementation:** `backend/src/routes/farmer.ts` (routes), `backend/src/repositories/farms.ts` & `products.ts` (SQL access filtered by `owner_id`), `backend/src/services/geocoder.ts`, `uploads.ts`, `markdown.ts`, `validation.ts`. All routes are mounted behind `requireAuth` + `requireRole('FARMER')` and filtered in SQL by `owner_id = req.user.id` (`ADR-07`).

* `GET /api/farmer/farm` — Storefront of the connected producer. **Implemented:** `404` if none has been created yet.
* `POST /api/farmer/farm` — Creates the storefront (`multipart/form-data`, mandatory `banner` field) (`C2-F1`, `C2-F2`). **Implemented:** server-side geocoding (`ADR-02`), `PENDING_APPROVAL` status, `201 { farm, farmId }`. Errors: `400` (invalid field, missing or non-image banner, > 5 MB), `409` (a storefront already exists), `422` (`GEOCODING_FAILED` — address not found in Switzerland).
* `PUT /api/farmer/farm` — Updates the storefront (`C2-F4`). **Implemented:** `APPROVED` stays `APPROVED` (immediate publication); `REJECTED` **returns to `PENDING_APPROVAL`** to re-enter the validation queue; banner optional (the previous one is kept then deleted if replaced); the address is only re-geocoded when it has changed.
* `POST /api/farmer/products` — Adds a product without stock (`C2-F3`). **Implemented:** `201 { product }`, `409` if the storefront does not exist yet.
* `PUT /api/farmer/products/:id` & `DELETE /api/farmer/products/:id` — Modifies or deletes a product (`C2-F3`). **Implemented:** `404` if the product does not belong to the producer (isolation is achieved by joining on `farms.owner_id`).
* `GET /api/farmer/baskets` — Lists the baskets received for their farm, newest first. **Implemented.**
* `PATCH /api/farmer/baskets/:id/adjust` — Removes unavailable items, recalculates the total and submits the offer (`C2-F5`, `C3-F3`). **Implemented:** `200 { basket }`. The total is always recomputed server-side from the price snapshot; removed lines keep `removed_by_farmer = 1` so the client can see *what* was dropped instead of it silently vanishing. Removing **every** line yields `REJECTED` rather than an empty offer. Errors: `400` (invalid item id), `404` (foreign/unknown basket), `409 INVALID_TRANSITION` unless the basket is `PENDING_FARMER`.

### Administrator area (`/api/admin/*` — `ADMIN` role required)

**Implementation:** `backend/src/routes/admin.ts` (deliberately minimal for now).

* `GET /api/admin/farms/pending` — Lists farms with `PENDING_APPROVAL` status, oldest first (`C3-F1`). **Implemented.**
* `GET /api/admin/baskets/:reference` — Identifies the basket a client is quoting during a dispute (`C3-F5`). **Implemented:** returns the basket with its account-or-guest identity and status; `400` for a malformed reference, `404` for an unknown one. Read-only on purpose: arbitration stays off-platform, and letting the administrator answer *as* the client would blur who agreed to what.
* `PATCH /api/admin/farms/:id/status` — Approves (`APPROVED`) or rejects (`REJECTED`) a farm (`C3-F1`). **Implemented:** only those two transitions are accepted (`400` otherwise), `404` if the id is unknown.

## 5. Frontend Component Structure (`frontend/src/`)

* **Current structure:** `App.vue` (navbar + bell + `<router-view>`), `router.ts` (6 routes), `auth.ts` (reactive store + `authHeaders`), `api.ts` (shared types, typed calls, single `apiFetch` wrapper that sends the guest cookie), `markdown.ts` (lazy-loaded Markdown preview). Views: `ClientView.vue` (MapLibre map + popups), `FarmView.vue` (farm details + basket composition, no login required), `MyBasketsView.vue` (baskets of the account **or** the device, accept/refuse), `FarmerView.vue` (producer area), `ReceivedOrdersView.vue` (producer order handling), `AdminView.vue` (farm validation). Components: `FarmEditor.vue`, `ProductManager.vue`, `AuthModal.vue`, `NotificationBell.vue`.
* **Layouts (not delivered):** `ClientLayout.vue` (map + bell + my baskets), `FarmerLayout.vue` (storefront/products/orders menu + bell), `AdminLayout.vue`. The areas are currently flat views plus a shared navbar.
* **Shared components:** `NotificationBell.vue` (delivered) — visible to every visitor, guest included, polling `GET /api/notifications` every 30 s and showing an unread badge. It is deliberately not gated on authentication, since the server resolves guests from their cookie.
