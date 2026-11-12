# PanierFermier

> [!IMPORTANT]
> **Status: WIP**.
> Please note that his project is not intended to go beyond the stage of a working prototype.

A privacy-first web application connecting local agricultural producers with consumers for direct farm-gate pickup. Built as part of the **Requirements Engineering for Information Systems** course at the University of Fribourg.

## Overview

Traditional e-commerce platforms require strict inventory tracking that is often too heavy for small-scale farmers dealing with seasonal, fluctuating harvests. This platform solves that problem by allowing farmers to list available products **without managing stock quantities** and adjust customer baskets before final confirmation.

### Key Features

* **Privacy-First Discovery:** Consumers browse approved farms on an interactive map without GPS tracking or personal address storage.
* **Flexible Basket Negotiation:** Customers compose a basket and select a payment method. Farmers can remove unavailable items before validating the final price, which the customer can then accept or decline.
* **Dual Payment Model:**
  * **Pay at the Farm:** Direct settlement (Cash, Card, TWINT) with zero platform fees and no financial guarantee.
  * **Online Escrow Payment:** Delegated via a PCI-DSS compliant payment provider (e.g., Stripe) with a fixed platform commission. Funds are held in escrow for **7 days** to protect both parties, with manual dispute arbitration by administrators.
* **Lightweight Storefront Management:** Farmers manage their banner, description, opening hours, mandatory farm address, and product catalog. After initial administrator approval, subsequent updates publish immediately.

## Tech Stack

* **Frontend:** Vue 3, TypeScript, Vite, Vue Router
* **Backend:** Node.js, Express, TypeScript, SQLite (`better-sqlite3`)
* **Documentation & Diagrams:** Markdown, PlantUML (automated SVG rendering via GitHub Actions)

## Project Structure

```text
├── .github/workflows/       # CI pipeline for automated PlantUML rendering
├── diagrams/                # Generated SVG diagrams (architecture, use cases, flows)
├── frontend/                # Vue 3 SPA (Client, Producer, and Admin views)
│   └── src/
│       ├── views/           # Role-specific views (ClientView, FarmerView, AdminView)
│       ├── router.ts        # Client-side routing
│       └── App.vue          # Root layout & navigation
├── backend/                 # Express REST API & SQLite database
├── Requirements.md          # Full Requirements Specification document
└── README.md

```

## Getting Started

### Prerequisites

* [Node.js](https://nodejs.org/) (v20+ recommended)
* npm

### 1. Run the Backend

```bash
cd backend
npm install
npx run dev
```

The API server will start on `http://localhost:3000`.

### 2. Run the Frontend

```bash
cd frontend
npm install
npm run dev
```

Open the local URL provided by Vite (typically `http://localhost:5173`) to access the three interfaces:

* `/` — Consumer interface
* `/producteur` — Producer interface
* `/admin` — Administrator interface

## Documentation & UML Diagrams

The complete system specification (including personas, scenarios, information flows, functional/non-functional requirements, and system architecture) is available in [`REQUIREMENTS.md`](https://www.google.com/search?q=./Requirements.md) (french).

All UML diagrams are written inline using PlantUML inside `REQUIREMENTS.md` and are stored in `assets/diagrams/*.svg`. You should re-generate them if you modify them.

```sh
plantuml -tsv REQUIREMENTS.md
```

## Authors

* **Han Kieu**
* **Léonard Clément**
