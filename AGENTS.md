# PanierFermier — Agentic Coding Instructions (SDD Workflow)

## Authoritative Specifications
- **Requirements:** `REQUIREMENTS.md` (French functional/non-functional specs).
- **Architecture & Contracts:** `SDD.md` (SQLite schema, 4-state basket lifecycle, REST endpoints, Vue 3 structure).
- **Prototype Scope Boundary:** Only **at-the-farm payment** (`CASH`, `CARTE`, `TWINT` on-site) is implemented. Do NOT implement Stripe, online checkout, commission calculations (`commission_cts` is always `0`), 7-day escrow (`C1-F5`, `C3-F4`), or dispute arbitration (`C3-F5`).

## Non-Negotiable Architectural & NFR Invariants
1. **Strict Client Privacy (`C1-NF1`):**
   - NEVER use `navigator.geolocation` anywhere in `frontend/`.
   - NEVER add address, city, postal code, or coordinate columns to the `users` table or client registration forms.
2. **Stock-Free Catalog (`C2-F3`):**
   - NEVER add inventory/stock quantity counters to `produits`. Producers toggle `disponible` or remove unavailable lines when reviewing a basket (`C2-F5`).
3. **Zero-Fee On-Site Settlement (`C3-F3`):**
   - Every basket uses an on-site method (`CASH`, `CARTE`, `TWINT`) enabled by the farm, with `commission_cts = 0` and `total_client_cts = sous_total_cts`.
4. **Integer Currency:**
   - Store and compute all CHF amounts in integer centimes (`*_cts`) on the backend. Format to `CHF XX.XX` only in the frontend UI.
5. **Immediate Approved Storefront Edits (`C2-F4`):**
   - Updating an already `APPROUVEE` farm must NEVER reset `statut_approbation` back to `EN_ATTENTE`.

## Tech Stack & Commands
- **Backend (`./backend`):** Node.js + Express + TypeScript + `better-sqlite3` + `zod`.
  - Typecheck: `cd backend && npx tsc --noEmit`
  - Test: `cd backend && npm test`
  - Dev server: `cd backend && npm run dev`
- **Frontend (`./frontend`):** Vue 3 (`<script setup lang="ts">`) + TypeScript + Vite + Vue Router + Leaflet.
  - Typecheck & Build: `cd frontend && npm run build`

## Execution Discipline
- Implement in 4 vertical slices mapped to requirement IDs:
  - **Slice 1:** SQLite schema, seed data (Clara, Marc, Sophie + Fribourg farms), Auth & Notifications (`C3-F2`).
  - **Slice 2:** Producer storefront & catalog CRUD + Admin farm approval (`C2-F1..C2-F4`, `C3-F1`).
  - **Slice 3:** Privacy-preserving Fribourg map & public storefront discovery (`C1-F1`, `C1-F2`, `C1-NF1`, `C2-NF1`).
  - **Slice 4:** Basket composition, producer adjustment/offer, and client accept/reject confirmation (`C1-F3`, `C1-F4`, `C2-F5`, `C3-F3`).
- After every code change, run `tsc --noEmit` (and relevant tests) via `bash` before finishing the turn.
