# Non-Functional Requirements

## C1-NF1 - Confidentialité
* **ID :** `C1-NF1`
* **Statut A2 :** Inclus
* **Description :** L'application ne doit ni demander l'accès au capteur GPS du terminal client, ni enregistrer d'adresse postale personnelle pour les consommateurs.
* **Critère mesurable :** L'inspection du code frontend ne contient aucun appel à `navigator.geolocation`, et le schéma SQLite des utilisateurs clients ne comporte aucun champ d'adresse ou de coordonnées.

## C1-NF2 - Sécurité paiements
* **ID :** `C1-NF2`
* **Statut A2 :** **Reporté (Deferred)** — Paiement en ligne exclu du prototype A2.

## C2-NF1 - Performance carte
* **ID :** `C2-NF1`
* **Statut A2 :** Inclus
* **Description :** L'affichage des fermes approuvées sur la carte interactive doit s'effectuer rapidement en charge normale.
* **Critère mesurable :** Au moins 95 % de 200 requêtes `GET /api/farms` aboutissent en moins de 500 ms sur une base SQLite contenant 500 fermes de test.

## C2-NF2 - Délai notifications
* **ID :** `C2-NF2`
* **Statut A2 :** Inclus
* **Description :** Les notifications internes lors des transitions de panier doivent être disponibles quasi instantanément après l'action déclenchante.
* **Critère mesurable :** 100 % des notifications sont persistées et accessibles via `GET /api/notifications` en moins de 200 ms après la requête de mutation de panier.

## C3-NF1 - Ergonomie vitrine
* **ID :** `C3-NF1`
* **Statut A2 :** Inclus
* **Description :** L'interface producteur permet de créer une vitrine (avec upload de photo) et d'ajuster un panier en un minimum d'étapes.
* **Critère mesurable :** Parcours E2E complet (création vitrine + 3 produits, puis retrait d'un article d'un panier) exécutable en moins de 6 actions utilisateur distinctes.
