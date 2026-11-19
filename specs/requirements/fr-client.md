# Functional Requirements — Catégorie 1 : Client

## C1-F1 - Exploration carte
* **ID :** `C1-F1`
* **Statut A2 :** Inclus (MapLibre GL JS + OpenStreetMap)
* **Description :** Le système affiche une carte interactive permettant à tout visiteur (sans compte requis) de repérer les fermes approuvées dans la zone géographique affichée.
* **Critères d'acceptation :** Seules les fermes au statut `APPROVED` apparaissent sur la carte ; aucune autorisation GPS n'est demandée au navigateur.

## C1-F2 - Consultation vitrine
* **ID :** `C1-F2`
* **Statut A2 :** Inclus
* **Description :** Le système affiche la page publique d'une ferme comprenant sa bannière photo, sa description, ses horaires d'ouverture, son adresse obligatoire, la liste des produits proposés et les moyens de paiement sur place acceptés.
* **Critères d'acceptation :** Cliquer sur un marqueur de ferme ouvre sa fiche détaillée avec l'ensemble des informations à jour.

## C1-F3 - Composition panier et paiement
* **ID :** `C1-F3`
* **Statut A2 :** Inclus (restreint au paiement sur place)
* **Description :** Un client authentifié compose un panier à partir des produits d'une ferme et choisit l'un des moyens de paiement à la ferme autorisés par ce producteur (Carte, TWINT, Cash).
* **Entrées :** `farmId`, liste d'articles `{ productId, quantity }`, `paymentMethod`.
* **Préconditions :** Client authentifié ; ferme au statut `APPROVED` ; au moins 1 article dans le panier.
* **Règles :** Tous les articles doivent appartenir à la même ferme ; le mode de paiement doit faire partie de ceux activés par le producteur ; statut initial `PENDING_FARMER` ; notification envoyée au producteur (`C3-F2`).
* **Critères d'acceptation :** Un panier valide est enregistré en base et déclenche une notification pour le producteur ; un panier vide ou avec un mode de paiement non autorisé est rejeté (HTTP 400).

## C1-F4 - Acceptation ou refus offre
* **ID :** `C1-F4`
* **Statut A2 :** Inclus
* **Description :** Le client examine le panier validé ou modifié par le producteur ainsi que le prix final proposé, puis décide d'accepter ou de rejeter l'offre.
* **Règles :** L'acceptation engage fermement le client à retirer son panier ; aucune annulation n'est possible après confirmation.
* **Critères d'acceptation :** Le refus fait passer le statut à `REJECTED` ; l'acceptation fait passer le statut à `CONFIRMED` et notifie le producteur.

## C1-F5 - Paiement en ligne garanti
* **ID :** `C1-F5`
* **Statut A2 :** **Reporté (Deferred)** — Exclu du périmètre prototype suite au retrait de Stripe.
