# Non-Functional Requirements

## C1-NF1 - Privacy
* **ID:** `C1-NF1`
* **A2 status:** Included
* **Description:** The application must neither request access to the client device's GPS sensor nor store any personal postal address for consumers.
* **Measurable criterion:** An inspection of the frontend code finds no call to `navigator.geolocation`, and the SQLite schema of client users contains no address or coordinate field.

## C1-NF2 - Payment security
* **ID:** `C1-NF2`
* **A2 status:** **Deferred** — Online payment excluded from the A2 prototype.

## C2-NF1 - Map performance
* **ID:** `C2-NF1`
* **A2 status:** Included
* **Description:** The display of approved farms on the interactive map must perform quickly under normal load.
* **Measurable criterion:** At least 95 % of 200 `GET /api/farms` requests complete in under 500 ms on an SQLite database containing 500 test farms.

## C2-NF2 - Notification delay
* **ID:** `C2-NF2`
* **A2 status:** Included
* **Description:** Internal notifications for basket transitions must be available almost instantly after the triggering action.
* **Measurable criterion:** 100 % of notifications are persisted and retrievable via `GET /api/notifications` in under 200 ms after the basket mutation request.

## C3-NF1 - Storefront ergonomics
* **ID:** `C3-NF1`
* **A2 status:** Included
* **Description:** The producer interface allows creating a storefront (with photo upload) and adjusting a basket in a minimal number of steps.
* **Measurable criterion:** A complete end-to-end journey (storefront creation + 3 products, then removal of one item from a basket) is executable in fewer than 6 distinct user actions.
