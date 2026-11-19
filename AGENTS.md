# AGENTS.md — Instructions for AI Co-Engineering (PanierFermier)

## 1. Project Context & Methodology
This repository (`UNIFR_RE_PROJECT_I`) implements **PanierFermier**, a privacy-first local farm discovery and basket reservation platform developed for the *Requirements Engineering for Information Systems* course (University of Fribourg).

Development strictly follows **Specification-Driven Development (SDD)**. Before writing or modifying any code, always read the relevant files in `specs/`:
* `specs/system-overview.md` — Vision, personas, active scenarios, and scope boundaries.
* `specs/requirements/fr-client.md` — Client functional requirements (`C1-F1` to `C1-F4`).
* `specs/requirements/fr-farmer.md` — Producer functional requirements (`C2-F1` to `C2-F5`).
* `specs/requirements/fr-admin.md` — Admin, notifications, and pricing requirements (`C3-F1` to `C3-F3`).
* `specs/requirements/nfr.md` — Measurable non-functional requirements (`C1-NF1`, `C2-NF1`, `C2-NF2`, `C3-NF1`).
* `specs/design.md` — Database schema, REST API contract, ADRs, and architecture.
* `specs/task-planning.md` & `specs/traceability.md` — Roadmap, implementation status, and deviations.

## 2. Repository Structure & Tech Stack
* **Language:** TypeScript exclusively across frontend, backend, and tests.
* **Frontend (`frontend/`):** Vue 3 (Composition API, `<script setup lang="ts">`), Tailwind CSS, Vue Router, MapLibre GL JS (OpenStreetMap tiles).
* **Backend (`backend/`):** Node.js, Express, SQLite (`better-sqlite3`), `multer` (local banner uploads), `bcrypt` + `jsonwebtoken` (auth). Server code lives in `backend/src/`.
* **Tests (`tests/`):** Vitest + Supertest (unit, integration, NFR benchmarks) and Playwright (E2E).
* **Specifications (`specs/` & `REQUIREMENTS.md`):** Markdown + inline PlantUML diagrams.

## 3. Strict Scope & Non-Negotiable Constraints

### Excluded / Deferred Features (DO NOT IMPLEMENT)
* **No Online Payments / Stripe / Escrow / Disputes:** Requirements `C1-F5`, `C3-F4`, `C3-F5`, and `C1-NF2` are explicitly deferred. Only **pay-at-the-farm** options (`CASH`, `TWINT_FARM`, `CARD_FARM`) with `0%` commission are supported. Keep data structures extensible (`payment_method` column), but do not add Stripe SDKs or mock payment gateways unless explicitly instructed.

### Privacy & Security Rules
* **Zero Client Geolocation (`C1-NF1`):** NEVER use `navigator.geolocation` in the frontend. NEVER add address, city, or coordinate fields to the `users` table or client registration forms.
* **Server-Side Role & Ownership Isolation:** Never rely on Vue Router guards for security. Every `/api/farmer/*` and `/api/admin/*` endpoint must validate the JWT via `requireAuth` and `requireRole(...)`, and filter SQL queries by `owner_id = req.user.id` so producers can only modify their own farm and baskets.
* **SQLite Foreign Keys:** Always ensure `db.pragma('foreign_keys = ON')` is active on database initialization.

### Domain-Specific Rules
* **No Stock Management (`C2-F3`):** Products must NEVER have a `stock` or `quantity_available` column. Availability is handled dynamically when the producer removes unavailable items from a requested basket (`C2-F5`).
* **Approval Workflow (`C2-F1`, `C2-F4`, `C3-F1`):** Newly created farms start with `status = 'PENDING_APPROVAL'` and are hidden from `/api/client/farms`. Once `APPROVED` by an admin, subsequent edits by the producer (`PUT /api/farmer/farm` or product CRUD) take effect immediately without resetting approval status.
* **Server-Side Geocoding:** When creating or updating a farm's address, geocode it on the backend using the free Swiss federal API (`https://api3.geo.admin.ch/rest/services/api/SearchServer?type=locations&searchText=...`) with fallback to OpenStreetMap Nominatim.
* **Local Image Uploads:** Store uploaded farm banners on disk in `backend/uploads/` via `multer` and serve them statically at `/uploads/<filename>`. Store only the relative URL in SQLite.
* **Extensible Notifications (`C3-F2`):** Persist notifications in SQLite via `NotificationService` using an extensible channel interface (`NotificationChannel`) so e-mail delivery can be plugged in later without changing route controllers.

## 4. Coding Conventions & SDD Synchronization
1. **Contract-First:** Match the exact table names, column names, status enums (`PENDING_APPROVAL`, `APPROVED`, `REJECTED` for farms; `PENDING_FARMER`, `OFFER_PROPOSED`, `CONFIRMED`, `REJECTED` for baskets), and REST endpoints defined in `specs/design.md`.
2. **Keep Specs Aligned:** Whenever an implementation detail deviates from `specs/design.md` or a task/requirement is completed, update `specs/design.md`, `specs/task-planning.md`, and `specs/traceability.md` in the same commit or PR.
3. **Test Coverage:** For every new endpoint or user flow, add or update corresponding tests in `tests/` referencing the requirement ID (e.g., `describe('C2-F5: Basket adjustment', ...)`).
4. **Simplicity:** Avoid unnecessary abstractions, external cloud services, or additional databases. Keep the prototype lightweight and easy to run locally (`npm install` + `npm run dev`).