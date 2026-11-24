# Task Planning — 4-Week Development Roadmap

**Team:** Dev A (Han Kieu) & Dev B (Léonard Clément)  
**Repository:** `UNIFR_RE_PROJECT_I`  
**Duration:** 4 weeks

> **Legend:** `[X]` done · `[~]` partial (contract in place, dependency missing) · `[ ]` to do
>
> **Last review:** 24 November 2026.
> The backend now exposes `/api/auth/*`, `/api/client/farms[/:id]`, `/api/farmer/*` and `/api/admin/*`; the remaining functional gap is the basket flow (`T3.2`–`T3.4`).

## Week 1: Technical Foundation, Database & Authentication (Shared)
* [X] **T1.1 (Dev A & B):** Initialise the tree (`client/`, `server/`, `tests/`, `specs/`) and the TypeScript + Tailwind CSS configurations.
* [X] **T1.2 (Dev B):** Implement the SQLite schema (`backend/src/db.ts`), the initial data script (seed with 1 Admin, 2 Farms, 1 Client) and the JWT middlewares (`requireAuth`, `requireRole`).
* [~] **T1.3 (Dev A):** Set up the Vue 3 router, the 3 layouts (`Client`, `Farmer`, `Admin`), the authentication store and the login/registration page.
  * Done: `frontend/src/router.ts` (4 routes), `frontend/src/auth.ts` (**reactive store** + `authHeaders` + `localStorage` helpers), views `ClientView` / `FarmerView` / `AdminView` / `FarmView`.
  * **Login/registration delivered**: `backend/src/routes/auth.ts` (`POST /api/auth/login`, `POST /api/auth/register`, `GET /api/auth/me`) and `frontend/src/components/AuthModal.vue` (Se connecter / Créer un compte tabs, `CLIENT`/`FARMER` role choice).
    * The "paste a JWT" inputs have been **removed** from `FarmerView.vue` and `AdminView.vue`.
    * Registration: e-mail lowercased, password 8–72 characters (bcrypt limit), `409` if the e-mail already exists, `400` when attempting to self-register an `ADMIN` account (only the seeded admin exists).
    * Login: single "Invalid e-mail or password" message for both an unknown e-mail *and* a wrong password (no account enumeration).
    * The JWT payload stays minimal (`sub`, `email`, `role`, `iat`, `exp`) — `C1-NF1` preserved.
  * Remaining: no `layouts/` directory (the 3 "layouts" are in fact 4 flat views plus a navbar in `App.vue`), and no router guard (deliberate: security is server-side, `ADR-07`).
* [ ] **T1.4 (Dev B):** Implement `NotificationService` (internal SQLite bell) + Vue component `NotificationBell.vue` (Dev A).
  * The `NotificationBell.vue` component is in fact Dev A's work (inconsistency in the original roadmap, preserved as-is).
* [ ] **T1.5 (Dev B):** Develop the Client interface.

## Week 2: Producer & Administration Flow (Storefront, Upload, Geocoding, Validation)
* [X] **T2.1 (Dev B):** Implement the geocoding service (`geo.admin.ch` / Nominatim) and the image upload with `multer` (`/uploads`). — **Done**
  * `backend/src/services/geocoder.ts`: `api3.geo.admin.ch` (`SearchServer`, `origins=address`) as primary, Nominatim fallback; 5 s timeout per call, result validated against the Swiss bounds, fallback chain when one provider is unavailable.
  * `backend/src/services/uploads.ts`: `multer` with `diskStorage` into `backend/uploads/`, random filename (UUID) + extension derived from the MIME type, 5 MB cap, MIME types limited to JPEG/PNG/WebP/GIF — **SVG deliberately refused** (XSS vector once served from our own origin). Served statically on `/uploads`.
  * `backend/src/server.ts`: central error handler translating `MulterError` (`LIMIT_FILE_SIZE`) and invalid MIME types into `400 { error, message }`.
* [X] **T2.2 (Dev B):** Create the `/api/farmer/farm` and `/api/farmer/products` endpoints (`C2-F1` to `C2-F4`) and `/api/admin/farms/*` (`C3-F1`). — **Done**
  * `backend/src/routes/farmer.ts`: `GET/POST/PUT /farm`, `POST/PUT/DELETE /products`, all behind `requireAuth` + `requireRole('FARMER')` **and** filtered in SQL by `owner_id = req.user.id`.
  * `backend/src/routes/admin.ts` (minimal): `GET /farms/pending`, `PATCH /farms/:id/status` (`APPROVED` / `REJECTED` only).
  * `backend/src/services/validation.ts`: field validation (maximum lengths, `paymentMethods` allowlist, finite and positive price) → `400`.
  * Implemented status rule: `APPROVED` stays `APPROVED` on save (`C2-F4`); **`REJECTED` returns to `PENDING_APPROVAL`** to re-enter the admin queue.
  * `backend/src/repositories/products.ts`: isolation by joining on `farms.owner_id`; camelCase DTO (`toProductDto`).
  * The former `*/hello` smoke routes have been removed from `server.ts`.
* [X] **T2.3 (Dev A):** Develop the Producer interface: storefront creation/edition form with banner upload and product CRUD management. — **Done (`e0d165b`, 22 Nov.)**
  * `frontend/src/components/FarmEditor.vue`: storefront creation/edition (`POST`/`PUT`), banner preview + validation (`<input type="file">` → `multipart/form-data`), minimal rich-text editor (bold/italic/subheading/lists + Preview tab), opening hours, on-site payment checkboxes (`C2-F1`, `C2-F2`, `C2-F4`, `C3-NF1`).
  * `frontend/src/components/ProductManager.vue`: product CRUD with no stock field whatsoever (`C2-F3`).
  * `frontend/src/markdown.ts`: **client-side** rendering reserved for the live preview of unsaved text (`renderMarkdownPreview`), based on `marked` + `DOMPurify` and loaded via **lazy import** — public visitors therefore never download these dependencies (separate chunk of 28.5 kB gzip; public bundle brought down from 72.6 to 44.8 kB gzip). The authoritative sanitisation is server-side (`ADR-04`).
  * `frontend/src/api.ts`: `fetchMyFarm`, `saveMyFarm`, `createProduct`, `updateProduct`, `deleteProduct` + readable HTTP error handling.
  * `frontend/src/views/FarmerView.vue`: storefront status assembly (`APPROVED` / `PENDING_APPROVAL` / `REJECTED`), editor and catalogue.
  * ✅ **`T2.1`/`T2.2` dependency cleared**: the endpoints now exist, and the storefront creation/edition + product CRUD journey works end to end (manually verified: creation → geocoding → `PENDING_APPROVAL` status → invisible on the map → admin approval → visible).
  * `FarmView.vue` and `ClientView.vue` now render `descriptionHtml` (server rendering) instead of raw Markdown; producer-controlled values in the map popup (`farm.name`, product names/units) are explicitly escaped.
  * Still no `tests/` (bonus, outside the current scope).
* [X] **T2.4 (Dev A):** Develop the Administrator interface: list of pending farms and Approve/Reject buttons (`C3-F1`). — **Done**
  * `frontend/src/views/AdminView.vue`: FIFO-sorted queue, a card per farm (banner, address, coordinates, opening hours, payments, description rendered from `descriptionHtml`, catalogue), **Approve** / **Reject** buttons with a per-farm `busy` state and a confirmation message.
  * Handles the 3 states: not connected (→ `AuthModal`), connected without the `ADMIN` role (→ explicit message), admin (→ the queue).
  * The producer-side status banner immediately reflects the outcome (the producer sees `REJECTED`, corrects the data, and the farm returns to `PENDING_APPROVAL`).

## Week 3: Client Flow & Basket Negotiation (Map, Order, Adjustment)
* [X] **T3.1 (Dev A):** Integrate the MapLibre GL JS + OpenStreetMap interactive map showing only approved farms (`C1-F1`) and the farm detail view (`C1-F2`). — **Done (`941ec98` + `c8e73d5`)**
  * `frontend/src/views/ClientView.vue`: MapLibre GL 4.7.1 loaded from unpkg, markers + popups from `GET /api/client/farms`.
  * `frontend/src/views/FarmView.vue`: farm details via `GET /api/client/farms/:id`, quantity selection, subtotal calculation.
  * ⚠️ `submitOrder()` is still a stub (`console.log`): the actual submission depends on `T3.2`.
  * The description is now rendered from `descriptionHtml` (HTML sanitised by the server) rather than plain text: headings/lists/bold typed by the producer display correctly.
* [ ] **T3.2 (Dev B):** Implement the basket endpoints (`/api/client/baskets`, `/api/farmer/baskets/:id/adjust`, `/api/client/baskets/:id/respond`) and the automatic price calculation (`C1-F3`, `C1-F4`, `C2-F5`, `C3-F3`).
* [ ] **T3.3 (Dev A):** Develop the client-side basket creation funnel and the "My Baskets" view (acceptance/refusal of an adjusted offer).
* [ ] **T3.4 (Dev B):** Develop the "Received Orders" view on the Producer side, allowing an unavailable item to be removed and the offer to be validated.

## Week 4: Automated Tests (Bonus), GitHub Actions CI & Final Documentation
* [ ] **T4.1 (Dev B):** Write the unit and API integration tests (Vitest + Supertest) covering all active FRs and the measurable NFRs (`C2-NF1`, `C2-NF2`).
* [ ] **T4.2 (Dev A):** Write the End-to-End tests (Playwright) covering the complete scenarios (Farm creation $\rightarrow$ Admin approval $\rightarrow$ Client basket $\rightarrow$ Producer adjustment $\rightarrow$ Confirmation).
* [ ] **T4.3 (Dev A & B):** Configure `.github/workflows/ci.yml` to automatically run the tests and the PlantUML generation on every push.
* [ ] **T4.4 (Dev A & B):** Finalise `specs/traceability.md`, `README.md` (including the AI usage declaration) and the PDF presentation (10–15 min).

## Status notes as of 24 November 2026 (after `T1.3`, `T2.1`–`T2.4`)

**Delivered:** backend foundation (SQLite schema + migration, seed, JWT, `requireAuth`/`requireRole`), **authentication** (`/api/auth/login`, `/register`, `/me` + `AuthModal.vue`), public endpoints `/api/client/farms[/:id]`, **producer endpoints `/api/farmer/*`** (storefront + catalogue, `owner_id` isolation), **admin endpoints `/api/admin/*`** and the **approval interface `AdminView.vue`** (`C3-F1`), server geocoding, banner upload, server-side sanitised Markdown rendering (`ADR-04`), map + farm details, producer interface.

**Journey now working end to end:** registration/login → storefront creation (photo + geocoding) → `PENDING_APPROVAL` → invisible on the public map → approval by the admin in the UI → visible on the map, with a rich-text description.

**Fixed on 24/11:** banners were not displaying in development — `vite.config.ts` only proxied `/api`, not `/uploads`. The upload and the database were correct (file written to `backend/uploads/`, `banner_url` stored, served by Express with HTTP 200); only the Vite proxy was missing. Added the `/uploads` entry. Also fixed: `authHeaders()` was spread *after* `Content-Type` in two `api.ts` calls (it would have overwritten the header).

**Remaining blockers:**
1. `T3.2`/`T3.3`/`T3.4` — no basket endpoint; `submitOrder()` in `FarmView.vue` is still a stub (`console.log`). This is the main remaining functional gap (`C1-F3`, `C1-F4`, `C2-F5`, `C3-F3`).
2. `T1.4` — `NotificationService` and `NotificationBell.vue` are missing.
3. `T1.5` — the client interface is limited to the map + farm details (no "My Baskets").
4. `T4.1`–`T4.3` — no `tests/` directory, no CI workflow. **Outside the scope for now** (course bonus, to be handled on explicit request).

**Note:** `specs/traceability.md` advertises test suites (`tests/…`) that do not exist and marks undelivered basket requirements as "Implemented"; to be corrected before the final submission.

**Naming inconsistency to fix:** `AGENTS.md` and `README.md` reference `specs/task-planning.md`, whereas the actual file is `specs/planning.md`.
