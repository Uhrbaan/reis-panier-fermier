# Technical Design Specification — PanierFermier

## 1. Architecture & Tech Stack
* **Frontend (`frontend/`) :** SPA **Vue 3** (Composition API, TypeScript), **Tailwind CSS**, **Vue Router**, **MapLibre GL JS** (tuiles OpenStreetMap).
* **Backend (`backend/`) :** **Node.js**, **Express**, **TypeScript**, **SQLite** (`better-sqlite3`), **Multer** (upload d'images local), **bcrypt** + **jsonwebtoken** (authentification).
* **Tests (`tests/`) :** **Vitest** + **Supertest** (tests unitaires et d'intégration API/NFR) et **Playwright** (tests E2E).

> **Note (T1.2) :** Les répertoires réels du dépôt sont `backend/` et `frontend/` (et non `server/` / `client/`). Le code serveur vit dans `backend/src/`.

## 2. Key Design Decisions (ADRs)

1. **ADR-01 — Exclusion de Stripe & Séquestre :** Les paiements en ligne sont retirés du périmètre A2. Le modèle `Basket` conserve le champ `payment_method` (`CASH`, `TWINT_FARM`, `CARD_FARM`) afin de permettre l'ajout ultérieur d'un mode `ONLINE_ESCROW` sans casser le schéma.
2. **ADR-02 — Géocodage côté serveur :** Lorsqu'un producteur soumet ou met à jour l'adresse de sa ferme (`C2-F1`, `C2-F4`), le backend interroge l'API gratuite suisse **geo.admin.ch** (`SearchServer`) avec repli sur **Nominatim (OpenStreetMap)** pour convertir l'adresse en `(latitude, longitude)` avant insertion en base.
3. **ADR-03 — Stockage des bannières sans 2e base de données :** Les images uploadées via `multipart/form-data` sont enregistrées par `multer` dans `backend/uploads/` et servies statiquement sous `/uploads/<filename>`. Seul le chemin relatif est stocké dans SQLite.
4. **ADR-04 — Service de notifications extensible (Strategy / Observer Pattern) :** La classe `NotificationService` écrit les notifications dans la table SQLite `notifications` (cloche interne `C3-F2`), tout en exposant une interface `NotificationChannel` permettant d'enregistrer ultérieurement un canal e-mail (`EmailChannel`) sans modifier les contrôleurs de commandes.
5. **ADR-05 — Authentification légère unifiée :** Une seule table `users` gère les trois rôles (`CLIENT`, `FARMER`, `ADMIN`) via JWT. Aucun champ d'adresse ou de GPS n'existe sur `users` (`C1-NF1`).
6. **ADR-06 — Autorisation côté serveur uniquement :** `requireAuth` valide la signature et l'expiration du JWT puis **relit l'utilisateur en base** à chaque requête (le rôle porté par le jeton n'est jamais considéré comme une vérité) ; `requireRole('FARMER' | 'ADMIN')` restreint ensuite l'accès. Les gardes Vue Router ne sont qu'un confort d'interface et ne constituent jamais la frontière de sécurité.

## 3. SQLite Database Schema

**Implémentation :** `backend/src/db.ts` (schéma + index), `backend/src/seed.ts` (jeu de démonstration), `backend/src/middleware/auth.ts` (JWT). Base par défaut : `backend/data/panierfermier.db` (surchargeable via `DB_PATH`, `:memory:` supporté). `foreign_keys = ON` est activé à chaque connexion et `journal_mode = WAL` en mode fichier.

**Index :** `farms(status)` (liste publique des fermes approuvées, `C2-NF1`), `farms(owner_id)`, `products(farm_id)`, `baskets(client_id)`, `baskets(farm_id)`, `basket_items(basket_id)`, `notifications(user_id, is_read)`, `notifications(basket_id)`.

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
  description TEXT NOT NULL,
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
  client_id INTEGER NOT NULL REFERENCES users(id),
  farm_id INTEGER NOT NULL REFERENCES farms(id),
  payment_method TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING_FARMER' CHECK(status IN ('PENDING_FARMER', 'OFFER_PROPOSED', 'CONFIRMED', 'REJECTED')),
  total_amount REAL NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
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
  user_id INTEGER NOT NULL REFERENCES users(id),
  message TEXT NOT NULL,
  basket_id INTEGER REFERENCES baskets(id),
  is_read INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

```

### 3.1. Seed de démonstration (`backend/src/seed.ts`)

Idempotent (aucune insertion si la table `users` contient déjà des lignes) et exécuté automatiquement au démarrage du serveur (`npm run seed` pour le lancer seul). Mot de passe commun : `password123`.

| Rôle | Email | Ferme créée | Statut |
| :--- | :--- | :--- | :--- |
| `ADMIN` | `sophie@example.ch` | — | — |
| `CLIENT` | `clara@example.ch` | — | — |
| `FARMER` | `marc@example.ch` | Ferme des Tilleuls (Fribourg) | `APPROVED` |
| `FARMER` | `anna@example.ch` | Ferme du Vully (Sugiez) | `PENDING_APPROVAL` |

Un producteur possède exactement une vitrine (`GET /api/farmer/farm`) : les 2 fermes demandées sont donc portées par 2 comptes `FARMER` distincts, ce qui préserve l'isolation `owner_id = req.user.id`. La ferme `APPROVED` alimente la carte (`C1-F1`), la ferme `PENDING_APPROVAL` permet de démontrer la validation administrateur (`C3-F1`). Les produits sont créés sans aucun champ de stock (`C2-F3`).

### 3.2. Middlewares JWT (`backend/src/middleware/auth.ts`)

| Middleware | Comportement | Codes |
| :--- | :--- | :--- |
| `requireAuth` | Extrait le jeton `Authorization: Bearer <jwt>`, vérifie signature + expiration, puis recharge l'utilisateur en base. | `401` (en-tête absent/malformé, jeton invalide ou expiré, compte supprimé) |
| `requireRole(...roles)` | Refuse l'accès si `req.user.role` n'appartient pas aux rôles autorisés. À monter après `requireAuth`. | `401` (non authentifié), `403` (rôle insuffisant) |

Le jeton est signé avec `JWT_SECRET` (obligatoire si `NODE_ENV=production`, repli de développement avec avertissement sinon) et expire après `JWT_EXPIRES_IN` (défaut `8h`). Le payload ne contient que `sub` (id), `email` et `role` : aucune donnée personnelle supplémentaire (`C1-NF1`).

## 4. REST API Contract

### Authentification & Notifications (Tous rôles)

* `POST /api/auth/register` — Création de compte (`CLIENT` ou `FARMER`).
* `POST /api/auth/login` — Connexion et retour du token JWT + profil utilisateur.
* `GET /api/notifications` — Liste des notifications de l'utilisateur connecté (`C3-F2`).
* `PATCH /api/notifications/:id/read` — Marque une notification comme lue.

### Espace Client & Public (`/api/client/*`)

* `GET /api/client/farms` — Retourne toutes les fermes au statut `APPROVED` (`C1-F1`). **Implémenté** (`backend/src/routes/client.ts`, public, sans authentification).
* `GET /api/client/farms/:id` — Détails d'une ferme approuvée + liste de ses produits (`C1-F2`). **Implémenté** : retourne `404` si la ferme n'existe pas ou n'est pas `APPROVED`.
* `POST /api/client/baskets` — Crée une demande de panier (`C1-F3`, `C3-F3`).
* `GET /api/client/baskets` — Liste les paniers du client connecté.
* `PATCH /api/client/baskets/:id/respond` — Accepte (`CONFIRMED`) ou refuse (`REJECTED`) une offre (`C1-F4`).

### Espace Producteur (`/api/farmer/*` — Rôle `FARMER` requis)

* `GET /api/farmer/farm` — Récupère la ferme du producteur connecté.
* `POST /api/farmer/farm` — Crée la vitrine (`multipart/form-data` pour `banner`, géocodage adresse, statut `PENDING_APPROVAL`) (`C2-F1`, `C2-F2`).
* `PUT /api/farmer/farm` — Met à jour la vitrine sans repasser par validation si déjà `APPROVED` (`C2-F4`).
* `POST /api/farmer/products` — Ajoute un produit sans stock (`C2-F3`).
* `PUT /api/farmer/products/:id` & `DELETE /api/farmer/products/:id` — Modifie ou supprime un produit (`C2-F3`).
* `GET /api/farmer/baskets` — Liste les paniers reçus pour sa ferme.
* `PATCH /api/farmer/baskets/:id/adjust` — Retire des articles indisponibles, recalcule le total et soumet l'offre (`C2-F5`, `C3-F3`).

### Espace Administrateur (`/api/admin/*` — Rôle `ADMIN` requis)

* `GET /api/admin/farms/pending` — Liste les fermes au statut `PENDING_APPROVAL` (`C3-F1`).
* `PATCH /api/admin/farms/:id/status` — Approuve (`APPROVED`) ou rejette (`REJECTED`) une ferme (`C3-F1`).

## 5. Frontend Component Structure (`frontend/src/`)

* **Layouts :** `ClientLayout.vue` (carte + cloche + mes paniers), `FarmerLayout.vue` (menu vitrine/produits/commandes + cloche), `AdminLayout.vue` (validations fermes).
* **Composants partagés :** `NotificationBell.vue`, `AuthModal.vue`, `FarmMap.vue` (MapLibre GL JS).

