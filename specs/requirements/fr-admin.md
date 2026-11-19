# Functional Requirements — Catégorie 3 : Administration, Notifications & Calculs

## C3-F1 - Approbation ferme
* **ID :** `C3-F1`
* **Statut A2 :** Inclus
* **Description :** Un administrateur examine les nouvelles pages fermes en attente et valide ou rejette manuellement leur publication sur la carte[cite: 14].
* **Critères d'acceptation :** L'approbation passe le statut de la ferme de `PENDING_APPROVAL` à `APPROVED` et la rend visible sur la carte publique (`C1-F1`) ; le rejet la passe à `REJECTED`[cite: 14].

## C3-F2 - Notifications commande
* **ID :** `C3-F2`
* **Statut A2 :** Inclus (cloche interne en base avec architecture extensible pour e-mail)
* **Description :** Le système génère automatiquement une notification lors de la création d'un panier, de l'envoi d'une offre ajustée par le producteur, et de la décision finale du client[cite: 14].
* **Critères d'acceptation :** Chaque transition d'état crée une notification non lue consultable dans la cloche de l'utilisateur destinataire et marquable comme lue.

## C3-F3 - Calcul prix et commission
* **ID :** `C3-F3`
* **Statut A2 :** Inclus (taux commission = 0 % pour paiement sur place)
* **Description :** Le système calcule automatiquement le prix total du panier à partir des produits retenus : $S = \sum (\text{prix}_i \times \text{quantité}_i)$[cite: 14].
* **Critères d'acceptation :** Le sous-total et le total client sont recalculés exactement à chaque modification d'article dans un panier[cite: 14].

## C3-F4 - Libération fonds 7j
* **ID :** `C3-F4`
* **Statut A2 :** **Reporté (Deferred)** — Dépendant du séquestre Stripe exclu[cite: 12, 13].

## C3-F5 - Arbitrage litige
* **ID :** `C3-F5`
* **Statut A2 :** **Reporté (Deferred)** — Dépendant du séquestre Stripe exclu[cite: 12, 13].
