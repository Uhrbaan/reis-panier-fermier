# Functional Requirements — Category 2: Producer

## C2-F1 - Storefront creation
* **ID:** `C2-F1`
* **A2 status:** Included (with local image upload and automatic geocoding)
* **Description:** A registered producer creates their farm page by mandatorily entering the name, the physical address, a banner photo (file upload), a description and their opening hours; the page remains hidden (`PENDING_APPROVAL`) until administrative validation (`C3-F1`).
* **Acceptance criteria:** Creation automatically derives `latitude` and `longitude` from the address, stores the image on the server and creates the farm with the `PENDING_APPROVAL` status.

## C2-F2 - Payment methods
* **ID:** `C2-F2`
* **A2 status:** Included (on-site payment options only)
* **Description:** The producer selects the direct payment methods accepted at the farm (Card, TWINT, Cash, with no fee and no guarantee).
* **Acceptance criteria:** At least one on-site payment method must be selected and is displayed on the public storefront.

## C2-F3 - Product catalogue
* **ID:** `C2-F3`
* **A2 status:** Included
* **Description:** The producer adds, modifies or deletes available products (name, unit, unit price) on their storefront at any time, without ever entering or maintaining stock quantities.
* **Acceptance criteria:** CRUD operations on products work without any stock field and immediately reflect the farm catalogue.

## C2-F4 - Storefront update
* **ID:** `C2-F4`
* **A2 status:** Included
* **Description:** Any update made by a producer to a page that has already been validated (`APPROVED`) is published instantly without a new manual approval.
* **Acceptance criteria:** Modifying the opening hours, the photo or the products of an approved farm keeps the `APPROVED` status and is immediately visible to clients.

## C2-F5 - Basket adjustment and offer
* **ID:** `C2-F5`
* **A2 status:** Included
* **Description:** Upon receiving a basket request, the producer may remove unavailable items and validate the final price automatically recalculated by the platform.
* **Inputs:** `basketId`, list of `lineItemIds` to remove.
* **Preconditions:** Basket with `PENDING_FARMER` status belonging to the connected producer's farm.
* **Acceptance criteria:** Removing an item recalculates the total (`C3-F3`), moves the status to `OFFER_PROPOSED` and sends an internal notification to the client (`C3-F2`); if all items are removed, the request moves to `REJECTED`.
