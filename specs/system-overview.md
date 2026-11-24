# System Overview — PanierFermier (A2 Sprints)

## 1. Product Vision & Scope (A2 Prototype)

**PanierFermier** is a web application that directly connects local producers with consumers, allowing users to locate farms on a privacy-respecting interactive map and to reserve adjustable baskets for on-site collection.

### Scope retained for Assignment 2
* **Included:** GPS-free map exploration (MapLibre GL JS + OpenStreetMap), storefront browsing, storefront creation and management with banner upload, product catalogue without stock management, basket negotiation (removal of unavailable items by the producer), fee-free on-site payment, manual approval of farms by the administrator, and an extensible internal notification system.
* **Excluded / Deferred:** Online payment integration via Stripe, the 7-day escrow and the financial dispute arbitration module (`C1-F5`, `C3-F4`, `C3-F5`, `C1-NF2`) are deliberately excluded from this prototype.

## 2. Users & Personas

1. **Clara Meylan (Client):** A privacy-conscious consumer. She explores the map without sharing her GPS position, composes a basket and accepts or refuses the producer's counter-offer before coming to pay for and collect her order at the farm.
2. **Marc Rochat (Producer):** A local market gardener. He creates his storefront (with a photo and a mandatory address), manages his catalogue without stock tracking and adjusts requested baskets according to his actual availability.
3. **Sophie Baumann (Administrator):** She manually validates newly created farms before they appear on the public map.

## 3. Main Scenarios (Active in A2)

* **Scenario 1 (Farm creation and validation):** Marc creates his storefront (`C2-F1`, `C2-F2`, `C2-F3`). It remains hidden until Sophie's manual approval (`C3-F1`). Marc's subsequent modifications are published immediately (`C2-F4`).
* **Scenarios 2 & 3 adapted (Discovery and reservation with on-site payment):** Clara explores the map around Fribourg without GPS (`C1-F1`, `C1-NF1`), consults Marc's page (`C1-F2`) and submits a basket with on-site payment (`C1-F3`). Marc receives an internal notification (`C3-F2`), removes an unavailable item and validates the recalculated price without commission (`C2-F5`, `C3-F3`). Clara is notified and confirms the firm order (`C1-F4`).

## 4. Reference to Assignment 1 Models

The complete conceptual models are defined in [`REQUIREMENTS.md`](../REQUIREMENTS.md):
* **Information Flow Diagram:** Section 3.1 (`assets/diagrams/info-flow.svg`) — *excluding the external Stripe flow*.
* **Use Case Diagram:** Section 3.2 (`assets/diagrams/use-case.svg`) — *use cases UC1 to UC4 and UC6 to UC8*.
* **Domain Model:** Section 3.3 (`assets/diagrams/domain-model.svg`) — *entities User, Farm, Product, Basket, BasketLine*.
