# Functional Requirements — Category 1: Client

## C1-F1 - Map exploration
* **ID:** `C1-F1`
* **A2 status:** Included (MapLibre GL JS + OpenStreetMap)
* **Description:** The system displays an interactive map allowing any visitor (no account required) to locate approved farms within the displayed geographical area.
* **Acceptance criteria:** Only farms with the `APPROVED` status appear on the map; no GPS permission is requested from the browser.

## C1-F2 - Storefront consultation
* **ID:** `C1-F2`
* **A2 status:** Included
* **Description:** The system displays the public page of a farm, including its banner photo, description, opening hours, mandatory address, the list of products offered and the accepted on-site payment methods.
* **Acceptance criteria:** Clicking on a farm marker opens its detail page with all information up to date.

## C1-F3 - Basket composition and payment
* **ID:** `C1-F3`
* **A2 status:** Included (restricted to on-site payment)
* **Description:** An authenticated client composes a basket from the products of a farm and selects one of the on-site payment methods enabled by that producer (Card, TWINT, Cash).
* **Inputs:** `farmId`, list of items `{ productId, quantity }`, `paymentMethod`.
* **Preconditions:** Client authenticated; farm with `APPROVED` status; at least 1 item in the basket.
* **Rules:** All items must belong to the same farm; the payment method must be one of those enabled by the producer; initial status `PENDING_FARMER`; notification sent to the producer (`C3-F2`).
* **Acceptance criteria:** A valid basket is persisted in the database and triggers a notification for the producer; an empty basket or one with an unauthorised payment method is rejected (HTTP 400).

## C1-F4 - Offer acceptance or refusal
* **ID:** `C1-F4`
* **A2 status:** Included
* **Description:** The client reviews the basket validated or modified by the producer together with the final proposed price, then decides whether to accept or reject the offer.
* **Rules:** Accepting firmly commits the client to collect the basket; no cancellation is possible after confirmation.
* **Acceptance criteria:** Refusal moves the status to `REJECTED`; acceptance moves the status to `CONFIRMED` and notifies the producer.

## C1-F5 - Guaranteed online payment
* **ID:** `C1-F5`
* **A2 status:** **Deferred** — Excluded from the prototype scope following the removal of Stripe.
