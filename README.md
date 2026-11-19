# PanierFermier (`UNIFR_RE_PROJECT_I`)

A privacy-first web application connecting local agricultural producers with consumers for direct farm-gate basket pickup. Developed using **Specification-Driven Development (SDD)** as part of the **Requirements Engineering for Information Systems** course at the University of Fribourg (Department of Informatics – DIGITS Research Group).

---

## 1. Project Description & Scope

**PanierFermier** addresses the logistical rigidity of traditional e-commerce platforms for small-scale local farms. Instead of maintaining strict daily stock inventories, producers publish their available products and adjust requested customer baskets based on real harvest availability before final confirmation.

### Active Prototype Scope (Assignment 2)
* **Privacy-First Map Discovery (`C1-F1`, `C1-NF1`):** Visitors and consumers explore approved farms on an interactive **MapLibre GL JS + OpenStreetMap** map without browser GPS tracking (`navigator.geolocation` is never invoked) or personal address storage.
* **Storefront & Stock-Free Catalog (`C2-F1` – `C2-F4`):** Producers create their farm profile with mandatory physical address (automatically geocoded on the backend via the Swiss federal **geo.admin.ch** API with Nominatim fallback), local banner image upload (`multer`), opening hours, and a product catalog without stock counters.
* **Interactive Basket Negotiation (`C1-F3`, `C1-F4`, `C2-F5`, `C3-F3`):** Clients compose a basket and select a farm-gate payment method (`CASH`, `TWINT_FARM`, `CARD_FARM`). Producers review requests, remove unavailable items, and submit an automatically recalculated offer (`0%` platform commission) for final client confirmation.
* **Admin Farm Verification (`C3-F1`):** New farm storefronts remain hidden (`PENDING_APPROVAL`) until manually approved by an administrator. Subsequent updates by approved farmers publish immediately (`C2-F4`).
* **Extensible Internal Notifications (`C3-F2`):** Order state transitions trigger in-app notifications backed by SQLite, designed with a channel interface (`NotificationChannel`) to support future e-mail delivery.

### Deferred Requirements (Out of A2 Scope)
* **Online Payments & 7-Day Escrow (`C1-F5`, `C3-F4`, `C3-F5`, `C1-NF2`):** Stripe integration, online escrow holding, and financial dispute arbitration are deferred to keep the prototype focused on core discovery, negotiation, and verification workflows.

---

## 2. Tech Stack

* **Language:** TypeScript (end-to-end across client, server, and test suites)
* **Frontend (`frontend/`):** Vue 3 (Composition API), Tailwind CSS, Vue Router, MapLibre GL JS
* **Backend (`backend/`):** Node.js, Express, SQLite (`better-sqlite3`), Multer (local image uploads), `bcrypt` & `jsonwebtoken` (JWT role-based authentication)
* **Testing & CI (`tests/`, `.github/workflows/`):** Vitest + Supertest (unit, integration, NFR performance benchmarks), Playwright (end-to-end tests), GitHub Actions (automated tests & PlantUML SVG rendering)

---

## 3. Repository Structure

```text
UNIFR_RE_PROJECT_I/
├── .github/
│   └── workflows/               # GitHub Actions CI (PlantUML rendering & automated test suite)
├── assets/
│   └── diagrams/                # Compiled SVG UML diagrams generated from REQUIREMENTS.md
├── frontend/                    # Vue 3 + Tailwind CSS Single Page Application
│   ├── src/
│   │   ├── components/          # Shared components (FarmMap, NotificationBell, AuthModal)
│   │   ├── layouts/             # Role-specific layouts (ClientLayout, FarmerLayout, AdminLayout)
│   │   ├── views/               # Client, Producer, and Administrator pages
│   │   ├── router/              # Vue Router configuration
│   │   └── stores/              # Authentication & application state
│   └── package.json
├── backend/                     # Node.js + Express + SQLite REST API
│   ├── src/
│   │   ├── config/env.ts        # Port, DB_PATH, JWT secret/expiry
│   │   ├── middleware/          # JWT authentication & role isolation (requireAuth, requireRole)
│   │   ├── repositories/        # SQL data access (users)
│   │   ├── routes/              # /api/auth, /api/client, /api/farmer, /api/admin, /api/notifications
│   │   ├── services/            # Geocoder (geo.admin.ch), NotificationService, pricing, passwords, JWT
│   │   ├── types/               # Domain models & Express `req.user` augmentation
│   │   ├── db.ts                # SQLite connection, schema & indexes
│   │   ├── seed.ts              # Demo dataset (1 admin, 1 client, 2 farms)
│   │   └── server.ts            # Express server entry point
│   ├── scripts/                 # `npm run seed`, `npm run token` helpers
│   ├── data/                    # Generated SQLite database (git-ignored)
│   ├── uploads/                 # Local storage for uploaded farm banners
│   └── package.json
├── specs/                       # Specification-Driven Development (SDD) artifacts
│   ├── requirements/            # Categorized FRs and NFRs (fr-client, fr-farmer, fr-admin, nfr)
│   ├── system-overview.md       # Vision, personas, active scenarios, and A1 model links
│   ├── design.md                # Technical architecture, ADRs, SQLite schema, REST API contract
│   ├── task-planning.md         # 4-week implementation & testing roadmap
│   └── traceability.md          # A1 <-> A2 traceability matrix, test evidence, and deviations
├── tests/                       # Automated test suites (Bonus)
│   ├── unit/                    # Pricing, privacy constraints, notification service
│   ├── integration/             # Express API endpoints & NFR response time checks
│   └── e2e/                     # Playwright end-to-end user flows
├── AGENTS.md                    # Architectural rules & constraints for AI co-engineering
├── REQUIREMENTS.md              # Full Assignment 1 Requirements Specification + inline PlantUML
└── README.md
```

---

## 4. Installation & Execution Instructions

### Prerequisites
* **Node.js** `v20+` and **npm**

### 1. Clone the Repository
```bash
git clone https://github.com/Uhrbaan/reis-panier-fermier
cd UNIFR_RE_PROJECT_I
```

### 2. Start the Backend Server
```bash
cd backend
npm install
cp .env.example .env   # then set JWT_SECRET
npm run dev
```
* The Express API starts on `http://localhost:3000`.
* On first launch, SQLite initializes the schema (`backend/data/panierfermier.db`) and seeds the demo accounts and two farms around Fribourg. The seed is idempotent, so restarting never duplicates data; `npm run seed` re-runs it explicitly.
* Security note: `JWT_SECRET` is mandatory when `NODE_ENV=production`; in development the server falls back to an insecure secret and prints a warning.

### 3. Start the Frontend Application
Open a second terminal:
```bash
cd frontend
npm install
npm run dev
```
* Open the local Vite URL displayed in the terminal (typically `http://localhost:5173`).

---

## 5. Usage & Demo Accounts

The application serves three distinct interfaces within a single Vue 3 SPA, backed by server-side JWT role enforcement:

| Role | Interface Route | Demo Email | Demo Password | Capabilities |
| :--- | :--- | :--- | :--- | :--- |
| **Client** | `/` | `clara@example.ch` | `password123` | Explore approved farms on map, view storefronts, compose baskets, accept/reject offers |
| **Producer** | `/producteur` | `marc@example.ch` | `password123` | Owner of *Ferme des Tilleuls* (`APPROVED`): edit storefront, upload banner, manage products (no stock), adjust incoming baskets |
| **Producer** | `/producteur` | `anna@example.ch` | `password123` | Owner of *Ferme du Vully* (`PENDING_APPROVAL`): handy for demoing the admin approval workflow |
| **Administrator** | `/admin` | `sophie@example.ch` | `password123` | Review pending farm registrations and approve or reject publication |

*(Public visitors can also explore the map and view approved farm pages without logging in, or register a new `CLIENT` or `FARMER` account directly via the UI.)*

---

## 6. Running Automated Tests

Automated unit, integration, NFR performance, and end-to-end tests are located in `tests/` and run automatically on every push via GitHub Actions:

```bash
# Run unit & API integration tests (Vitest + Supertest)
cd server
npm test

# Run End-to-End browser tests (Playwright)
cd ../tests
npx playwright test
```

---

## 7. Specification-Driven Development (SDD) Artifacts

* **Assignment 1 Baseline:** [`REQUIREMENTS.md`](./REQUIREMENTS.md)
* **System Overview:** [`specs/system-overview.md`](./specs/system-overview.md)
* **Categorized Requirements:** [`specs/requirements/`](./specs/requirements/)
* **Technical Design & API Contract:** [`specs/design.md`](./specs/design.md)
* **Task Roadmap:** [`specs/task-planning.md`](./specs/task-planning.md)
* **Traceability & Deviations:** [`specs/traceability.md`](./specs/traceability.md)

---

## 8. Declaration of AI Use

In accordance with the course guidelines for AI co-engineering:
* **AI Tools Used:** Google Gemini / Google Antigravity / Pi.dev harness / Deepseek V4.1 Flash / other LLM coding assistants.
* **Scope of AI Assistance:**
  * Structuring and refining the SDD Markdown artifacts (`specs/*`, `AGENTS.md`, `README.md`) from the Assignment 1 specification.
  * Scaffolding boilerplate code for the Express REST endpoints, SQLite schema, Vue 3 views/layouts, and automated test cases (Vitest, Supertest, Playwright).
* **Manual Engineering & Verification:** Both team members manually designed the system scope, configured the MapLibre GL JS integration, reviewed and adapted all generated TypeScript code, executed end-to-end verification against the requirements in `specs/traceability.md`, and take full responsibility for the final implementation.

---

## 9. Authors (Group I)

* **Han Kieu** (`hankieu`)
* **Léonard Clément** (`Uhrbaan`)