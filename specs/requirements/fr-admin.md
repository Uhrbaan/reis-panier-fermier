# Functional Requirements — Category 3: Administration, Notifications & Calculations

## C3-F1 - Farm approval
* **ID:** `C3-F1`
* **A2 status:** Included
* **Description:** An administrator reviews newly created farm pages and manually validates or rejects their publication on the map.
* **Acceptance criteria:** Approval moves the farm status from `PENDING_APPROVAL` to `APPROVED` and makes it visible on the public map (`C1-F1`); rejection moves it to `REJECTED`.

## C3-F2 - Order notifications
* **ID:** `C3-F2`
* **A2 status:** Included (internal in-database bell with an architecture extensible to e-mail)
* **Description:** The system automatically generates a notification when a basket is created, when the producer submits an adjusted offer, and when the client makes the final decision.
* **Acceptance criteria:** Each state transition creates an unread notification that can be consulted in the recipient's bell and marked as read.

## C3-F3 - Price and commission calculation
* **ID:** `C3-F3`
* **A2 status:** Included (commission rate = 0 % for on-site payment)
* **Description:** The system automatically calculates the total basket price from the retained products: $S = \sum (\text{price}_i \times \text{quantity}_i)$.
* **Acceptance criteria:** The producer subtotal and the client total are recalculated exactly on every item change within a basket.

## C3-F4 - 7-day fund release
* **ID:** `C3-F4`
* **A2 status:** **Deferred** — Depends on the excluded Stripe escrow.

## C3-F5 - Dispute arbitration
* **ID:** `C3-F5`
* **A2 status:** **Deferred** — Depends on the excluded Stripe escrow.
