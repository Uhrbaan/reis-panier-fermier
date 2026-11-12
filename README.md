# 📖 TypeScript Guestbook Application

A simple, full-stack guestbook application built with **TypeScript**, **Node.js (Express)**, **SQLite**, and **Vue 3**.

---

## 🏗️ Architecture Overview

The project is split into two independent services:

* **`backend/` (Node.js + Express + SQLite):**
  * Serves REST API endpoints (`GET /api/entries`, `POST /api/entries`).
  * Uses `better-sqlite3` to store guestbook notes inside a persistent `guestbook.db` file.
  * Auto-initializes the table schema on startup.

* **`frontend/` (Vue 3 + Vite):**
  * Single Page Application built with Vue Single-File Components (`.vue`).
  * Uses Vite dev server with proxy settings configured to forward `/api` requests directly to Express (`http://localhost:3000`).

---

## 🚀 Getting Started

### Prerequisites
* Node.js (v18+)
* `npm`

---

### 1. Start the Backend

```bash
cd backend
npm install
npm run dev
```

(The backend starts on http://localhost:3000)

### 2. Start the Frontend

In a new terminal window:
```bash 
cd frontend
npm install
npm run dev
```

## 💻 How It Works

1.  **Viewing Entries:** When `frontend/src/App.vue` mounts, it issues a `GET /api/entries` request. Express queries `guestbook.db` and returns an array of JSON entry objects to Vue.
2.  **Submitting Entries:** Submitting the form sends a `POST /api/entries` request containing `{ name, message }`. Express inserts the entry into SQLite and returns the newly generated object, which Vue instantly prepends to the page list.

## Repository structure
```
├── backend/
│   ├── guestbook.db          # Auto-generated SQLite database
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       └── server.ts         # Express server & SQLite endpoints
│
└── frontend/
    ├── package.json
    ├── vite.config.ts        # Includes proxy setup to backend
    ├── tsconfig.json
    └── src/
        ├── App.vue           # Guestbook UI & form logic
        ├── main.ts           # Vue application entry point
        └── env.d.ts          # TypeScript declarations for .vue files
```
