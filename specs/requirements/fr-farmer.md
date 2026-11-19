# Functional Requirements — Catégorie 2 : Producteur

## C2-F1 - Création vitrine
* **ID :** `C2-F1`
* **Statut A2 :** Inclus (avec upload d'image local et géocodage automatique)
* **Description :** Un producteur inscrit crée sa page ferme en saisissant obligatoirement le nom, l'adresse physique, une bannière photo (upload fichier), une description et ses horaires d'ouverture ; la page reste masquée (`PENDING_APPROVAL`) jusqu'à validation administrative (`C3-F1`).
* **Critères d'acceptation :** La création déduit automatiquement `latitude` et `longitude` depuis l'adresse, enregistre l'image sur le serveur et crée la ferme avec le statut `PENDING_APPROVAL`.

## C2-F2 - Moyens de paiement
* **ID :** `C2-F2`
* **Statut A2 :** Inclus (options paiement sur place uniquement)
* **Description :** Le producteur sélectionne les modalités de règlement direct à la ferme qu'il accepte (Carte, TWINT, Cash, sans frais ni garantie).
* **Critères d'acceptation :** Au moins un moyen de paiement sur place doit être sélectionné et s'affiche sur la vitrine publique.

## C2-F3 - Catalogue produits
* **ID :** `C2-F3`
* **Statut A2 :** Inclus
* **Description :** Le producteur ajoute, modifie ou supprime des produits disponibles (nom, unité, prix unitaire) sur sa vitrine à tout moment, sans jamais saisir ni maintenir de quantités en stock.
* **Critères d'acceptation :** Les opérations CRUD sur les produits fonctionnent sans champ de stock et reflètent immédiatement le catalogue de la ferme.

## C2-F4 - Mise à jour vitrine
* **ID :** `C2-F4`
* **Statut A2 :** Inclus
* **Description :** Toute mise à jour apportée par un producteur à une page déjà validée (`APPROVED`) est publiée instantanément sans nouvelle approbation manuelle.
* **Critères d'acceptation :** La modification des horaires, de la photo ou des produits d'une ferme approuvée conserve le statut `APPROVED` et est visible immédiatement par les clients.

## C2-F5 - Ajustement panier et offre
* **ID :** `C2-F5`
* **Statut A2 :** Inclus
* **Description :** À réception d'une demande de panier, le producteur peut retirer les articles indisponibles et valider le prix final recalculé automatiquement par la plateforme.
* **Entrées :** `basketId`, liste des `lineItemIds` à retirer.
* **Préconditions :** Panier au statut `PENDING_FARMER` appartenant à la ferme du producteur connecté.
* **Critères d'acceptation :** Le retrait d'un article recalcule le total (`C3-F3`), passe le statut à `OFFER_PROPOSED` et envoie une notification interne au client (`C3-F2`) ; si tous les articles sont retirés, la demande passe à `REJECTED`.
