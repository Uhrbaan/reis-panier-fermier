# Task Planning — 4-Week Development Roadmap

**Équipe :** Dev A (Han Kieu) & Dev B (Léonard Clément)  
**Dépôt :** `UNIFR_RE_PROJECT_I`  
**Durée :** 4 semaines

> **Légende :** `[X]` terminé · `[~]` partiel (contrat en place, dépendance manquante) · `[ ]` à faire
>
> **Dernière revue :** 24 novembre 2026 (après les commits `e0d165b`, `c8e73d5`, `779178a`).
> ⚠️ Le backend n'expose encore que `/api/client/farms` (+ les routes de test `*/hello`) : les écrans producteur et administrateur sont développés **contre le contrat REST de `specs/design.md`** et renverront `404` tant que `T2.1`/`T2.2` ne sont pas livrés.

## Semaine 1 : Socle Technique, Base de Données & Authentification (Commun)
* [X] **T1.1 (Dev A & B) :** Initialiser l'arborescence (`client/`, `server/`, `tests/`, `specs/`) et les configurations TypeScript + Tailwind CSS.
* [X] **T1.2 (Dev B) :** Implémenter le schéma SQLite (`backend/src/db.ts`), le script de données initiales (seed avec 1 Admin, 2 Fermes, 1 Client) et les middlewares JWT (`requireAuth`, `requireRole`).
* [~] **T1.3 (Dev A) :** Mettre en place le routeur Vue 3, les 3 Layouts (`Client`, `Farmer`, `Admin`), le store d'authentification et la page de connexion/inscription.
  * Fait : `frontend/src/router.ts` (4 routes), `frontend/src/auth.ts` (**store réactif** + `authHeaders` + helpers `localStorage`), vues `ClientView` / `FarmerView` / `AdminView` / `FarmView`.
  * **Connexion/inscription livrées** : `backend/src/routes/auth.ts` (`POST /api/auth/login`, `POST /api/auth/register`, `GET /api/auth/me`) et `frontend/src/components/AuthModal.vue` (onglets Se connecter / Créer un compte, choix du rôle `CLIENT`/`FARMER`).
    * Les champs « coller un jeton JWT » ont été **supprimés** de `FarmerView.vue` et `AdminView.vue`.
    * Inscription : e-mail normalisé en minuscules, mot de passe 8–72 caractères (limite bcrypt), `409` si l'e-mail existe déjà, `400` si l'on tente de se créer un compte `ADMIN` (seul l'admin du seed existe).
    * Connexion : message unique « Invalid e-mail or password » pour un e-mail inconnu *et* un mot de passe faux (pas d'énumération de comptes).
    * Le payload JWT reste minimal (`sub`, `email`, `role`, `iat`, `exp`) — `C1-NF1` préservé.
  * Reste : aucun dossier `layouts/` (les 3 « layouts » sont en réalité 4 vues plates + une navbar dans `App.vue`), et aucun garde de routeur (volontaire : la sécurité est serveur, `ADR-07`).
* [ ] **T1.4 (Dev B) :** Implémenter `NotificationService` (cloche interne SQLite) + composant Vue `NotificationBell.vue` (Dev A).
  * Le composant `NotificationBell.vue` est en fait à faire par Dev A (incohérence de la roadmap d'origine, conservée telle quelle).
* [ ] **T1.5 (Dev B) :** Développer l'interface Client.

## Semaine 2 : Flux Producteur & Administration (Vitrine, Upload, Géocodage, Validation)
* [X] **T2.1 (Dev B) :** Implémenter le service de géocodage (`geo.admin.ch` / Nominatim) et l'upload d'image avec `multer` (`/uploads`). — **Fait**
  * `backend/src/services/geocoder.ts` : `api3.geo.admin.ch` (`SearchServer`, `origins=address`) en primaire, repli sur Nominatim ; timeout de 5 s par appel, validation que le résultat tombe dans les bornes de la Suisse, chaîne de repli si un fournisseur est indisponible.
  * `backend/src/services/uploads.ts` : `multer` en `diskStorage` vers `backend/uploads/`, nom de fichier aléatoire (UUID) + extension déduite du MIME, plafond 5 Mo, MIME limités à JPEG/PNG/WebP/GIF — **SVG volontairement refusé** (vecteur XSS une fois servi depuis notre origine). Servi statiquement sur `/uploads`.
  * `backend/src/server.ts` : handler d'erreur central traduisant `MulterError` (`LIMIT_FILE_SIZE`) et MIME invalide en `400 { error, message }`.
* [X] **T2.2 (Dev B) :** Créer les endpoints `/api/farmer/farm`, `/api/farmer/products` (`C2-F1` à `C2-F4`) et `/api/admin/farms/*` (`C3-F1`). — **Fait**
  * `backend/src/routes/farmer.ts` : `GET/POST/PUT /farm`, `POST/PUT/DELETE /products`, toutes derrière `requireAuth` + `requireRole('FARMER')` **et** filtrées en SQL par `owner_id = req.user.id`.
  * `backend/src/routes/admin.ts` (minimal) : `GET /farms/pending`, `PATCH /farms/:id/status` (`APPROVED` / `REJECTED` seulement).
  * `backend/src/services/validation.ts` : validation des champs (longueurs maximales, `paymentMethods` en liste blanche, prix fini et positif) → `400`.
  * Règle de statut implémentée : `APPROVED` reste `APPROVED` à la sauvegarde (`C2-F4`) ; **`REJECTED` repasse à `PENDING_APPROVAL`** pour revenir dans la file admin.
  * `backend/src/repositories/products.ts` : isolation par jointure `farms.owner_id` ; DTO camelCase (`toProductDto`).
  * Anciennes routes de test `*/hello` supprimées de `server.ts`.
* [X] **T2.3 (Dev A) :** Développer l'interface Producteur : formulaire de création/édition de vitrine avec upload de bannière et gestion CRUD des produits. — **Fait (`e0d165b`, 22 nov.)**
  * `frontend/src/components/FarmEditor.vue` : création/édition de vitrine (`POST`/`PUT`), aperçu + validation de la bannière (`<input type="file">` → `multipart/form-data`), éditeur de texte riche minimal (gras/italique/sous-titre/listes + onglet Aperçu), horaires d'ouverture, cases à cocher des paiements sur place (`C2-F1`, `C2-F2`, `C2-F4`, `C3-NF1`).
  * `frontend/src/components/ProductManager.vue` : CRUD produits sans aucun champ de stock (`C2-F3`).
  * `frontend/src/markdown.ts` : rendu **client** réservé à l'aperçu temps réel du texte non sauvegardé (`renderMarkdownPreview`), basé sur `marked` + `DOMPurify` et chargé en **lazy import** — les visiteurs publics ne téléchargent donc jamais ces dépendances (chunk séparé de 28,5 kB gzip ; bundle public ramené de 72,6 à 44,8 kB gzip). L'assainissement faisant autorité est côté serveur (`ADR-04`).
  * `frontend/src/api.ts` : `fetchMyFarm`, `saveMyFarm`, `createProduct`, `updateProduct`, `deleteProduct` + gestion d'erreurs HTTP lisible.
  * `frontend/src/views/FarmerView.vue` : assemblage statut de vitrine (`APPROVED` / `PENDING_APPROVAL` / `REJECTED`), éditeur et catalogue.
  * ✅ **Dépendance `T2.1`/`T2.2` levée** : les endpoints existent désormais, le parcours création/édition de vitrine + CRUD produits fonctionne de bout en bout (vérifié manuellement : création → géocodage → statut `PENDING_APPROVAL` → invisible sur la carte → approbation admin → visible).
  * `FarmView.vue` et `ClientView.vue` rendent maintenant `descriptionHtml` (rendu serveur) et non plus le Markdown brut ; les valeurs contrôlées par le producteur dans la popup carte (`farm.name`, noms/unités de produits) sont échappées explicitement.
  * Toujours pas de `tests/` (bonus, hors périmètre actuel).
* [X] **T2.4 (Dev A) :** Développer l'interface Administrateur : liste des fermes en attente et boutons Approuver/Rejeter (`C3-F1`). — **Fait**
  * `frontend/src/views/AdminView.vue` : file d'attente triée FIFO, carte de chaque ferme (bannière, adresse, coordonnées, horaires, paiements, description rendue depuis `descriptionHtml`, catalogue), boutons **Approuver** / **Rejeter** avec état `busy` par ferme et message de confirmation.
  * Gère les 3 états : non connecté (→ `AuthModal`), connecté sans rôle `ADMIN` (→ message explicite), admin (→ file d'attente).
  * Le bandeau de statut côté producteur reflète immédiatement le résultat (le producteur voit `REJECTED`, corrige, et la ferme revient en `PENDING_APPROVAL`).

## Semaine 3 : Flux Client & Négociation de Panier (Carte, Commande, Ajustement)
* [X] **T3.1 (Dev A) :** Intégrer la carte interactive MapLibre GL JS + OpenStreetMap affichant uniquement les fermes approuvées (`C1-F1`) et la vue détail ferme (`C1-F2`). — **Fait (`941ec98` + `c8e73d5`)**
  * `frontend/src/views/ClientView.vue` : MapLibre GL 4.7.1 chargée depuis unpkg, marqueurs + popups sur `GET /api/client/farms`.
  * `frontend/src/views/FarmView.vue` : fiche ferme via `GET /api/client/farms/:id`, sélection des quantités, calcul du sous-total.
  * ⚠️ `submitOrder()` est encore un stub (`console.log`) : la soumission réelle dépend de `T3.2`.
  * La description est désormais rendue depuis `descriptionHtml` (HTML assaini par le serveur) et non plus en texte brut : les titres/listes/gras saisis par le producteur s'affichent correctement.
* [ ] **T3.2 (Dev B) :** Implémenter les endpoints de panier (`/api/client/baskets`, `/api/farmer/baskets/:id/adjust`, `/api/client/baskets/:id/respond`) et le calcul automatique du prix (`C1-F3`, `C1-F4`, `C2-F5`, `C3-F3`).
* [ ] **T3.3 (Dev A) :** Développer le tunnel de création de panier côté Client et la vue « Mes Paniers » (acceptation/refus d'offre ajustée).
* [ ] **T3.4 (Dev B) :** Développer la vue « Commandes reçues » côté Producteur permettant de retirer un article manquant et de valider l'offre.

## Semaine 4 : Tests Automatisés (Bonus), CI GitHub Actions & Documentation Finale
* [ ] **T4.1 (Dev B) :** Écrire les tests unitaires et d'intégration API (Vitest + Supertest) couvrant toutes les FR actives et les NFR mesurables (`C2-NF1`, `C2-NF2`).
* [ ] **T4.2 (Dev A) :** Écrire les tests End-to-End (Playwright) couvrant les scénarios complets (Création ferme $\rightarrow$ Approbation Admin $\rightarrow$ Panier Client $\rightarrow$ Ajustement Producteur $\rightarrow$ Confirmation).
* [ ] **T4.3 (Dev A & B) :** Configurer `.github/workflows/ci.yml` pour exécuter automatiquement les tests et la génération PlantUML à chaque push.
* [ ] **T4.4 (Dev A & B) :** Finaliser `specs/traceability.md`, `README.md` (incluant la déclaration d'usage de l'IA) et la présentation PDF (10–15 min).

## Notes d'état au 24 novembre 2026 (après `T1.3`, `T2.1`–`T2.4`)

**Livré :** socle backend (schéma SQLite + migration, seed, JWT, `requireAuth`/`requireRole`), **authentification** (`/api/auth/login`, `/register`, `/me` + `AuthModal.vue`), endpoints publics `/api/client/farms[/:id]`, **endpoints producteur `/api/farmer/*`** (vitrine + catalogue, isolation `owner_id`), **endpoints admin `/api/admin/*`** et **interface d'approbation `AdminView.vue`** (`C3-F1`), géocodage serveur, upload de bannières, rendu Markdown assaini côté serveur (`ADR-04`), carte + fiche ferme, interface producteur.

**Chaîne désormais fonctionnelle de bout en bout :** inscription/connexion → création de vitrine (photo + géocodage) → `PENDING_APPROVAL` → invisible sur la carte publique → approbation par l'admin dans l'UI → visible sur la carte, avec description en texte riche.

**Corrigé le 24/11 :** les bannières ne s'affichaient pas en développement — `vite.config.ts` ne proxifiait que `/api`, pas `/uploads`. L'upload et la base étaient corrects (fichier écrit dans `backend/uploads/`, `banner_url` enregistré, servi par Express en HTTP 200) ; seul le proxy Vite manquait. Ajout de l'entrée `/uploads`. Également corrigé : `authHeaders()` était étalé *après* `Content-Type` dans deux appels `api.ts` (aurait écrasé l'en-tête).

**Bloqueurs restants :**
1. `T3.2`/`T3.3`/`T3.4` — aucun endpoint de panier ; `submitOrder()` dans `FarmView.vue` est toujours un stub (`console.log`). C'est le principal trou fonctionnel restant (`C1-F3`, `C1-F4`, `C2-F5`, `C3-F3`).
2. `T1.4` — `NotificationService` et `NotificationBell.vue` absents.
3. `T1.5` — l'interface client se limite à la carte + fiche ferme (pas de « Mes paniers »).
4. `T4.1`–`T4.3` — aucun dossier `tests/`, aucun workflow CI. **Hors périmètre pour l'instant** (bonus de cours, à traiter sur demande explicite).

**À noter :** `specs/traceability.md` annonce des suites de tests (`tests/…`) qui n'existent pas et marque comme « Implémenté » des exigences de panier non livrées ; à corriger avant le rendu final.

**Incohérence de nommage à corriger :** `AGENTS.md` et `README.md` référencent `specs/task-planning.md`, alors que le fichier réel est `specs/planning.md`.
