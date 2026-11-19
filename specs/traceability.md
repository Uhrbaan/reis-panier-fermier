# Requirements Traceability Matrix & Deviations (A1 $\rightarrow$ A2)

## 1. Matrice de traçabilité (Exigences A1 vs Implémentation A2)

| ID | Nom | Statut A2 | Composants / Fichiers liés | Preuves de test |
| :--- | :--- | :--- | :--- | :--- |
| `C1-F1` | Exploration carte | **Implémenté** | `FarmMap.vue`, `GET /api/client/farms` | `tests/e2e/client-flow.spec.ts` |
| `C1-F2` | Consultation vitrine | **Implémenté** | `FarmDetailView.vue`, `GET /api/client/farms/:id` | `tests/integration/client.test.ts` |
| `C1-F3` | Composition panier et paiement | **Implémenté (adapté)** | `BasketDrawer.vue`, `POST /api/client/baskets` | `tests/integration/baskets.test.ts` |
| `C1-F4` | Acceptation ou refus offre | **Implémenté (adapté)** | `MyBasketsView.vue`, `PATCH /api/client/baskets/:id/respond` | `tests/e2e/negotiation.spec.ts` |
| `C1-F5` | Paiement en ligne garanti | **Reporté (Deferred)** | *Exclu du périmètre A2* | N/A |
| `C2-F1` | Création vitrine | **Implémenté** | `FarmEditor.vue`, `POST /api/farmer/farm`, `geocoder.ts` | `tests/integration/farmer.test.ts` |
| `C2-F2` | Moyens de paiement | **Implémenté (adapté)** | `FarmEditor.vue` (options sur place uniquement) | `tests/integration/farmer.test.ts` |
| `C2-F3` | Catalogue produits | **Implémenté** | `ProductManager.vue`, `/api/farmer/products` | `tests/integration/farmer.test.ts` |
| `C2-F4` | Mise à jour vitrine | **Implémenté** | `PUT /api/farmer/farm` | `tests/integration/farmer.test.ts` |
| `C2-F5` | Ajustement panier et offre | **Implémenté** | `FarmerOrdersView.vue`, `PATCH /api/farmer/baskets/:id/adjust` | `tests/e2e/negotiation.spec.ts` |
| `C3-F1` | Approbation ferme | **Implémenté** | `AdminValidationsView.vue`, `PATCH /api/admin/farms/:id/status` | `tests/e2e/admin-flow.spec.ts` |
| `C3-F2` | Notifications commande | **Implémenté (adapté)** | `NotificationBell.vue`, `NotificationService.ts` | `tests/unit/notifications.test.ts` |
| `C3-F3` | Calcul prix et commission | **Implémenté (adapté)** | `pricing.ts` (commission = 0 % sur place) | `tests/unit/pricing.test.ts` |
| `C3-F4` | Libération fonds 7j | **Reporté (Deferred)** | *Exclu du périmètre A2* | N/A |
| `C3-F5` | Arbitrage litige | **Reporté (Deferred)** | *Exclu du périmètre A2* | N/A |
| `C1-NF1` | Confidentialité | **Implémenté** | Schéma `users` sans adresse, absence de `geolocation` | `tests/unit/privacy.test.ts` |
| `C1-NF2` | Sécurité paiements | **Reporté (Deferred)** | *Exclu du périmètre A2* | N/A |
| `C2-NF1` | Performance carte | **Implémenté** | Index SQLite sur `farms(status)` | `tests/integration/perf.test.ts` |
| `C2-NF2` | Délai notifications | **Implémenté** | Insertion synchrone dans `NotificationService` | `tests/integration/perf.test.ts` |
| `C3-NF1` | Ergonomie vitrine | **Implémenté** | Parcours unifié `FarmEditor.vue` | `tests/e2e/farmer-flow.spec.ts` |

## 2. Écarts documentés par rapport à l'Assignment 1

1. **Retrait complet du paiement en ligne (Stripe) et du séquestre :** Pour concentrer le prototype de 4 semaines sur le cœur métier (découverte cartographique sans GPS et négociation de paniers sans gestion de stocks), l'intégration Stripe (`C1-F5`, `C3-F4`, `C3-F5`, `C1-NF2`) a été reportée.
2. **Notifications internes plutôt qu'e-mails externes :** `C3-F2` est implémenté via une cloche de notifications persistée dans SQLite plutôt que par envoi d'e-mails SMTP. L'architecture serveur utilise toutefois une interface `NotificationChannel` permettant d'ajouter un connecteur e-mail ultérieurement.
3. **Géocodage automatique à la création de ferme :** En complément de `C2-F1`, le serveur déduit automatiquement les coordonnées GPS de la ferme via l'API suisse `geo.admin.ch` (avec repli sur Nominatim) à partir de l'adresse saisie par le producteur.
4. **Stockage local des bannières :** Les bannières photos (`C2-F1`) sont téléversées via `multer` et servies depuis le système de fichiers local du serveur (`server/uploads/`), sans recourir à un stockage cloud externe.

