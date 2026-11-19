# Task Planning — 4-Week Development Roadmap

**Équipe :** Dev A (Han Kieu) & Dev B (Léonard Clément)  
**Dépôt :** `UNIFR_RE_PROJECT_I`  
**Durée :** 4 semaines

## Semaine 1 : Socle Technique, Base de Données & Authentification (Commun)
* [ ] **T1.1 (Dev A & B) :** Initialiser l'arborescence (`client/`, `server/`, `tests/`, `specs/`) et les configurations TypeScript + Tailwind CSS[cite: 12].
* [ ] **T1.2 (Dev B) :** Implémenter le schéma SQLite (`server/db.ts`), le script de données initiales (seed avec 1 Admin, 2 Fermes, 1 Client) et les middlewares JWT (`requireAuth`, `requireRole`).
* [ ] **T1.3 (Dev A) :** Mettre en place le routeur Vue 3, les 3 Layouts (`Client`, `Farmer`, `Admin`), le store d'authentification et la page de connexion/inscription.
* [ ] **T1.4 (Dev B) :** Implémenter `NotificationService` (cloche interne SQLite) + composant Vue `NotificationBell.vue` (Dev A).

## Semaine 2 : Flux Producteur & Administration (Vitrine, Upload, Géocodage, Validation)
* [ ] **T2.1 (Dev B) :** Implémenter le service de géocodage (`geo.admin.ch` / Nominatim) et l'upload d'image avec `multer` (`/uploads`).
* [ ] **T2.2 (Dev B) :** Créer les endpoints `/api/farmer/farm`, `/api/farmer/products` (`C2-F1` à `C2-F4`) et `/api/admin/farms/*` (`C3-F1`).
* [ ] **T2.3 (Dev A) :** Développer l'interface Producteur : formulaire de création/édition de vitrine avec upload de bannière et gestion CRUD des produits.
* [ ] **T2.4 (Dev A) :** Développer l'interface Administrateur : liste des fermes en attente et boutons Approuver/Rejeter (`C3-F1`).

## Semaine 3 : Flux Client & Négociation de Panier (Carte, Commande, Ajustement)
* [ ] **T3.1 (Dev A) :** Intégrer la carte interactive MapLibre GL JS + OpenStreetMap affichant uniquement les fermes approuvées (`C1-F1`) et la vue détail ferme (`C1-F2`).
* [ ] **T3.2 (Dev B) :** Implémenter les endpoints de panier (`/api/client/baskets`, `/api/farmer/baskets/:id/adjust`, `/api/client/baskets/:id/respond`) et le calcul automatique du prix (`C1-F3`, `C1-F4`, `C2-F5`, `C3-F3`).
* [ ] **T3.3 (Dev A) :** Développer le tunnel de création de panier côté Client et la vue « Mes Paniers » (acceptation/refus d'offre ajustée).
* [ ] **T3.4 (Dev B) :** Développer la vue « Commandes reçues » côté Producteur permettant de retirer un article manquant et de valider l'offre.

## Semaine 4 : Tests Automatisés (Bonus), CI GitHub Actions & Documentation Finale
* [ ] **T4.1 (Dev B) :** Écrire les tests unitaires et d'intégration API (Vitest + Supertest) couvrant toutes les FR actives et les NFR mesurables (`C2-NF1`, `C2-NF2`).
* [ ] **T4.2 (Dev A) :** Écrire les tests End-to-End (Playwright) couvrant les scénarios complets (Création ferme $\rightarrow$ Approbation Admin $\rightarrow$ Panier Client $\rightarrow$ Ajustement Producteur $\rightarrow$ Confirmation).
* [ ] **T4.3 (Dev A & B) :** Configurer `.github/workflows/ci.yml` pour exécuter automatiquement les tests et la génération PlantUML à chaque push[cite: 13].
* [ ] **T4.4 (Dev A & B) :** Finaliser `specs/traceability.md`, `README.md` (incluant la déclaration d'usage de l'IA) et la présentation PDF (10–15 min)[cite: 12, 13].

