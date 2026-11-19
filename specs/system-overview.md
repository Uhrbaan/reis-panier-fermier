# System Overview — PanierFermier (Sprints A2)

## 1. Product Vision & Scope (A2 Prototype)

**PanierFermier** est une application web de mise en relation directe entre producteurs locaux et consommateurs permettant de repérer les fermes sur une carte interactive respectueuse de la vie privée et de réserver des paniers ajustables avant retrait sur place.

### Périmètre retenu pour l'Assignment 2
* **Inclus :** Exploration cartographique sans GPS (MapLibre GL JS + OpenStreetMap), consultation des vitrines, création/gestion de vitrine avec upload de bannière, catalogue produits sans gestion de stock, négociation de panier (retrait d'articles indisponibles par le producteur), paiement sur place sans frais, approbation manuelle des fermes par l'administrateur et système de notifications internes extensibles.
* **Exclus / Reportés (Deferred) :** L'intégration de paiement en ligne via Stripe, le séquestre de 7 jours et le module d'arbitrage de litiges financiers (`C1-F5`, `C3-F4`, `C3-F5`, `C1-NF2`) sont volontairement exclus de ce prototype.

## 2. Users & Personas

1. **Clara Meylan (Client) :** Consommatrice soucieuse de sa vie privée. Explore la carte sans partage GPS, compose un panier et accepte ou refuse la contre-offre du producteur avant de venir payer et retirer sa commande à la ferme.
2. **Marc Rochat (Producteur) :** Maraîcher local. Crée sa vitrine (avec photo et adresse obligatoire), gère son catalogue sans suivi de stock et ajuste les paniers demandés selon ses disponibilités réelles.
3. **Sophie Baumann (Administratrice) :** Valide manuellement les nouvelles exploitations créées avant qu'elles n'apparaissent sur la carte publique.

## 3. Main Scenarios (Active in A2)

* **Scénario 1 (Création et validation d'une ferme) :** Marc crée sa vitrine (`C2-F1`, `C2-F2`, `C2-F3`). Elle reste masquée jusqu'à l'approbation manuelle de Sophie (`C3-F1`). Les modifications ultérieures de Marc sont publiées immédiatement (`C2-F4`).
* **Scénario 2 & 3 adaptés (Découverte et réservation avec paiement sur place) :** Clara explore la carte autour de Fribourg sans GPS (`C1-F1`, `C1-NF1`), consulte la fiche de Marc (`C1-F2`) et soumet un panier avec paiement à la ferme (`C1-F3`). Marc reçoit une notification interne (`C3-F2`), retire un article manquant et valide le prix recalculé sans commission (`C2-F5`, `C3-F3`). Clara est notifiée et confirme la commande ferme (`C1-F4`).

## 4. Reference to Assignment 1 Models

Les modèles conceptuels complets sont définis dans [`REQUIREMENTS.md`](../REQUIREMENTS.md) :
* **Information Flow Diagram :** Section 3.1 (`assets/diagrams/info-flow.svg`) — *hors flux externe Stripe*.
* **Use Case Diagram :** Section 3.2 (`assets/diagrams/use-case.svg`) — *cas d'utilisation UC1 à UC4 et UC6 à UC8*.
* **Domain Model :** Section 3.3 (`assets/diagrams/domain-model.svg`) — *entités Utilisateur, Ferme, Produit, Panier, LignePanier*.
