# Software Design Document (SDD) — PanierFermier (At-the-Farm Prototype)

| Metadata | Value |
| :--- | :--- |
| **System** | PanierFermier (Working Prototype — On-Site Payment Scope) |
| **Traceability Baseline** | `REQUIREMENTS.md` v0.1 (`C1-F1`..`C1-F4`, `C2-F1`..`C2-F5`, `C3-F1`..`C3-F3`, `C1-NF1`, `C2-NF1`..`C3-NF1`) |
| **Deferred / Out of Prototype Scope** | Online Stripe Connect checkout (`C1-F5`), 7-day escrow auto-release (`C3-F4`), escrow dispute arbitration (`C3-F5`), PCI-DSS card delegation (`C1-NF2`) |
| **Frontend Stack** | Vue 3 (Composition API `<script setup lang="ts">`), TypeScript, Vite, Vue Router, Leaflet (OSM) |
| **Backend Stack** | Node.js (v20+), Express, TypeScript, SQLite (`better-sqlite3`), `zod` (validation) |

---

## 1. Architectural Decisions & Prototype Scope

1. **Monorepo Boundary:**
   * `backend/`: Stateless REST JSON API on `http://localhost:3000` backed by a local SQLite file (`backend/data/panierfermier.sqlite`).
   * `frontend/`: Single Page Application on `http://localhost:5173` communicating solely over `/api/*` (via Vite dev proxy) and fetching map tiles directly from OpenStreetMap (`tile.openstreetmap.org`) in the browser so the backend never receives client GPS or location tracking (`C1-NF1`).
2. **Payment Scope (At-the-Farm Only):**
   * Only direct settlement at the farm (`SUR_PLACE`: `CASH`, `CARTE`, `TWINT`) is implemented in this prototype.
   * Per `C3-F3`, on-site payments carry **zero platform commission** (`commission_cts = 0`, `total_client_cts = sous_total_cts`) and no escrow hold.
   * No external payment gateway (Stripe) or webhook subsystem is included.
3. **Notifications (`C3-F2`, `C2-NF2`):**
   * Implemented via an asynchronous `NotificationService` backed by a `notifications` SQLite table and polled/streamed to the UI notification drawer in `< 5s`.
4. **Authentication:**
   * Lightweight JWT auth with pre-seeded demo accounts matching the personas in `REQUIREMENTS.md` (Clara Meylan — Client, Marc Rochat — Producteur, Sophie Baumann — Administratrice) plus standard registration/login.

---

## 2. Database Schema (SQLite / `better-sqlite3`)

All primary keys use UUIDv4 strings (`TEXT PRIMARY KEY`). Monetary amounts are stored as integer **centimes (CHF × 100)** (`INTEGER`) to avoid floating-point rounding errors.

```sql
PRAGMA foreign_keys = ON;

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  role TEXT NOT NULL CHECK (role IN ('CLIENT', 'PRODUCTEUR', 'ADMIN')),
  nom TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  telephone TEXT,                     -- Nullable; NEVER store client address or GPS (C1-NF1)
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE fermes (
  id TEXT PRIMARY KEY,
  producteur_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  admin_approbateur_id TEXT REFERENCES users(id),
  nom TEXT NOT NULL,
  description TEXT NOT NULL,
  adresse_physique TEXT NOT NULL,     -- Mandatory farm pickup address (C2-F1)
  latitude REAL NOT NULL,
  longitude REAL NOT NULL,
  banniere_url TEXT NOT NULL,
  horaires_ouverture TEXT NOT NULL,
  statut_approbation TEXT NOT NULL DEFAULT 'EN_ATTENTE'
    CHECK (statut_approbation IN ('EN_ATTENTE', 'APPROUVEE', 'REJETEE')),
  motif_rejet TEXT,
  -- Accepted on-site payment methods configured by the producer (C2-F2)
  accepte_cash INTEGER NOT NULL DEFAULT 1 CHECK (accepte_cash IN (0, 1)),
  accepte_carte INTEGER NOT NULL DEFAULT 0 CHECK (accepte_carte IN (0, 1)),
  accepte_twint INTEGER NOT NULL DEFAULT 0 CHECK (accepte_twint IN (0, 1)),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_fermes_statut_coords ON fermes(statut_approbation, latitude, longitude);

CREATE TABLE produits (
  id TEXT PRIMARY KEY,
  ferme_id TEXT NOT NULL REFERENCES fermes(id) ON DELETE CASCADE,
  nom TEXT NOT NULL,
  unite TEXT NOT NULL,                -- e.g., 'kg', 'pièce', 'pot 500g', 'litre'
  prix_unitaire_cts INTEGER NOT NULL CHECK (prix_unitaire_cts > 0),
  disponible INTEGER NOT NULL DEFAULT 1 CHECK (disponible IN (0, 1))
  -- Deliberately NO stock_quantity column per C2-F3
);

CREATE TABLE paniers (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES users(id),
  ferme_id TEXT NOT NULL REFERENCES fermes(id),
  moyen_paiement_sur_place TEXT NOT NULL CHECK (moyen_paiement_sur_place IN ('CASH', 'CARTE', 'TWINT')),
  statut TEXT NOT NULL DEFAULT 'EN_ATTENTE_PRODUCTEUR'
    CHECK (statut IN (
      'EN_ATTENTE_PRODUCTEUR',
      'OFFRE_PROPOSEE',
      'ANNULEE',
      'CONFIRMEE_SUR_PLACE'
    )),
  sous_total_cts INTEGER NOT NULL DEFAULT 0,
  commission_cts INTEGER NOT NULL DEFAULT 0 CHECK (commission_cts = 0), -- Always 0 for on-site payment (C3-F3)
  total_client_cts INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE lignes_panier (
  id TEXT PRIMARY KEY,
  panier_id TEXT NOT NULL REFERENCES paniers(id) ON DELETE CASCADE,
  produit_id TEXT NOT NULL REFERENCES produits(id),
  nom_produit_fige TEXT NOT NULL,
  unite_figee TEXT NOT NULL,
  quantite INTEGER NOT NULL CHECK (quantite >= 1),
  prix_unitaire_fige_cts INTEGER NOT NULL CHECK (prix_unitaire_fige_cts > 0)
);

CREATE TABLE notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  panier_id TEXT REFERENCES paniers(id),
  type TEXT NOT NULL,
  message TEXT NOT NULL,
  lu INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

```

---

## 3. Core Domain Invariants & State Machine

### 3.1. Pricing Calculation (`C3-F3` — At-the-Farm Branch)

Given retained `lignes_panier` where $S = \sum (\text{quantite}_i \times \text{prix\_unitaire\_fige\_cts}_i)$:

* `sous_total_cts` $= S$
* `commission_cts` $= 0$
* `total_client_cts` $= S$

### 3.2. Basket Lifecycle State Machine (`C1-F3`, `C1-F4`, `C2-F5`, `C3-F2`)

| Current State | Trigger / Endpoint | Actor | Next State | Side Effects |
| --- | --- | --- | --- | --- |
| *(none)* | `POST /api/paniers` | Client | `EN_ATTENTE_PRODUCTEUR` | Snapshot unit prices; validate chosen `moyen_paiement_sur_place` is enabled on farm; notify Producteur (`C3-F2`). |
| `EN_ATTENTE_PRODUCTEUR` | `PATCH /api/producteur/paniers/:id/offre` (≥1 item kept) | Producteur | `OFFRE_PROPOSEE` | Delete removed `lignes_panier`; recalculate exact `S` (`commission_cts = 0`); notify Client (`C3-F2`). |
| `EN_ATTENTE_PRODUCTEUR` | `PATCH /api/producteur/paniers/:id/offre` (0 items kept) | Producteur | `ANNULEE` | Notify Client that requested items are unavailable (`C2-F5`). |
| `OFFRE_PROPOSEE` | `POST /api/paniers/:id/decision` (`reject`) | Client | `ANNULEE` | Notify Producteur of refusal (`C1-F4`). |
| `OFFRE_PROPOSEE` | `POST /api/paniers/:id/decision` (`accept`) | Client | `CONFIRMEE_SUR_PLACE` | Non-cancellable pickup commitment; notify Producteur to prepare basket; expose farm pickup address & hours (`C1-F4`). |

---

## 4. REST API Contract

### 4.1. Auth & Profile

* `POST /api/auth/login` — Body: `{ email, password }` → `{ token, user }`
* `POST /api/auth/register` — Body: `{ nom, email, password, role, telephone? }` → `{ token, user }` (Reject any `adresse` or `gps` fields per `C1-NF1`).
* `GET /api/auth/me` — Returns current user + unread notification count.

### 4.2. Public Discovery (`C1-F1`, `C1-F2`, `C2-NF1`)

* `GET /api/fermes?minLat=&maxLat=&minLng=&maxLng=`
* **Public (no auth required)**.
* Returns **only** `statut_approbation = 'APPROUVEE'` farms within bounding box.
* Must execute indexed bounding-box query in `< 50ms` (`C2-NF1`).


* `GET /api/fermes/:id`
* Returns farm storefront details (`nom`, `description`, `adresse_physique`, `latitude`, `longitude`, `banniere_url`, `horaires_ouverture`, `accepte_cash`, `accepte_carte`, `accepte_twint`) + active `produits` (`disponible = 1`).
* Returns `404` if `statut_approbation !== 'APPROUVEE'` (unless requested by owner or `ADMIN`).



### 4.3. Producer Storefront & Catalog (`C2-F1`..`C2-F5`)

* `GET /api/producteur/ferme` — Returns authenticated producer's farm (any approval status) + all products.
* `POST /api/producteur/ferme` — Creates farm with `statut_approbation = 'EN_ATTENTE'` (`C2-F1`). Requires at least one on-site payment method (`accepte_cash`, `accepte_carte`, or `accepte_twint` = `1`) (`C2-F2`). Alerts Admin.
* `PUT /api/producteur/ferme` — Updates storefront fields and accepted on-site payment flags (`C2-F4`). **Preserves** `statut_approbation = 'APPROUVEE'` immediately without re-approval.
* `POST /api/producteur/ferme/produits` — Adds product (`nom`, `unite`, `prix_unitaire_cts`, `disponible`) (`C2-F3`).
* `PUT /api/producteur/produits/:id` & `DELETE /api/producteur/produits/:id` — Immediate catalog update (`C2-F4`).
* `GET /api/producteur/paniers` — Lists incoming and active baskets for producer's farm.
* `PATCH /api/producteur/paniers/:id/offre` — Body: `{ retainedLigneIds: string[] }`. Removes missing lines, recalculates `S` (`total_client_cts = S`), transitions to `OFFRE_PROPOSEE` (or `ANNULEE` if empty) (`C2-F5`).

### 4.4. Consumer Baskets (`C1-F3`, `C1-F4`)

* `POST /api/paniers` — Body: `{ fermeId, moyenPaiementSurPlace, items: [{ produitId, quantite }] }`.
* Enforces single-farm constraint (`C1-F3`) and validates `moyenPaiementSurPlace` (`'CASH' | 'CARTE' | 'TWINT'`) is enabled on `ferme`.


* `GET /api/paniers` — Lists authenticated client's baskets with status, retained items, farm pickup address, and opening hours.
* `POST /api/paniers/:id/decision` — Body: `{ action: 'accept' | 'reject' }`.
* If `reject` → `ANNULEE`.
* If `accept` → `CONFIRMEE_SUR_PLACE` (non-cancellable; no cancel endpoint exists).



### 4.5. Administration & Notifications (`C3-F1`, `C3-F2`)

* `GET /api/admin/fermes?statut=EN_ATTENTE` — Lists farms pending verification.
* `PATCH /api/admin/fermes/:id/approbation` — Body: `{ decision: 'APPROUVEE' | 'REJETEE', motifRejet? }` (`C3-F1`).
* `GET /api/notifications` & `PATCH /api/notifications/:id/read` — Retrieves and acknowledges user notifications (`C3-F2`).

---

## 5. Frontend Architecture (`frontend/src/`)

```text
frontend/src/
├── api/
│   └── client.ts              # Typed fetch wrapper (attaches Bearer token; NEVER calls navigator.geolocation)
├── stores/
│   └── auth.ts                # Reactive auth state + persona quick-switcher banner for prototype demo
├── components/
│   ├── FarmMap.vue            # Leaflet OSM map centered on Fribourg (46.8065, 7.1619), manual pan/zoom only
│   ├── StorefrontModal.vue    # Farm banner, hours, address, on-site payment badges, basket builder (C1-F2, C1-F3)
│   └── NotificationBell.vue   # Notification drawer with unread counter (C3-F2)
├── views/
│   ├── ClientView.vue         # Route `/` — Map exploration, storefront drawer, basket offers & pickup confirmation
│   ├── FarmerView.vue         # Route `/producteur` — Storefront editor, stock-free catalog, incoming basket adjuster
│   └── AdminView.vue          # Route `/admin` — Pending farm approval queue (C3-F1)
└── router.ts                  # Routes: `/`, `/producteur`, `/admin`

```

**Strict Privacy Guardrail (`C1-NF1`):** `navigator.geolocation` must **never** appear anywhere in `frontend/src/`. The map initializes at Fribourg (`46.8065, 7.1619`, zoom `12`) and loads farms strictly via map viewport bounds (`moveend`).
