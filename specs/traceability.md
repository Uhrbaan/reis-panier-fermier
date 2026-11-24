# Requirements Traceability Matrix & Deviations (A1 $\rightarrow$ A2)

## 1. Traceability matrix (A1 requirements vs. A2 implementation)

| ID | Name | A2 status | Related components / files | Test evidence |
| :--- | :--- | :--- | :--- | :--- |
| `C1-F1` | Map exploration | **Implemented** | `ClientView.vue`, `GET /api/client/farms` (public, `APPROVED` only) | `tests/e2e/client-flow.spec.ts` |
| `C1-F2` | Storefront consultation | **Implemented** | `FarmView.vue`, `GET /api/client/farms/:id` (public, `404` if not approved) | `tests/integration/client.test.ts` |
| `C1-F3` | Basket composition and payment | **Implemented (adapted)** | `FarmView.vue`, `POST /api/client/baskets` | `tests/integration/baskets.test.ts` |
| `C1-F4` | Offer acceptance or refusal | **Implemented (adapted)** | `MyBasketsView.vue`, `PATCH /api/client/baskets/:id/respond` | `tests/e2e/negotiation.spec.ts` |
| `C1-F5` | Guaranteed online payment | **Deferred** | *Excluded from the A2 scope* | N/A |
| `C2-F1` | Storefront creation | **Implemented** | `FarmEditor.vue`, `POST /api/farmer/farm`, `geocoder.ts` | `tests/integration/farmer.test.ts` |
| `C2-F2` | Payment methods | **Implemented (adapted)** | `FarmEditor.vue` (on-site options only) | `tests/integration/farmer.test.ts` |
| `C2-F3` | Product catalogue | **Implemented** | `ProductManager.vue`, `/api/farmer/products` | `tests/integration/farmer.test.ts` |
| `C2-F4` | Storefront update | **Implemented** | `PUT /api/farmer/farm` | `tests/integration/farmer.test.ts` |
| `C2-F5` | Basket adjustment and offer | **Implemented** | `FarmerOrdersView.vue`, `PATCH /api/farmer/baskets/:id/adjust` | `tests/e2e/negotiation.spec.ts` |
| `C3-F1` | Farm approval | **Implemented** | `AdminView.vue`, `PATCH /api/admin/farms/:id/status` | `tests/e2e/admin-flow.spec.ts` |
| `C3-F2` | Order notifications | **Implemented (adapted)** | `NotificationBell.vue`, `NotificationService.ts` | `tests/unit/notifications.test.ts` |
| `C3-F3` | Price and commission calculation | **Implemented (adapted)** | `pricing.ts` (commission = 0 % for on-site payment) | `tests/unit/pricing.test.ts` |
| `C3-F4` | 7-day fund release | **Deferred** | *Excluded from the A2 scope* | N/A |
| `C3-F5` | Dispute arbitration | **Deferred** | *Excluded from the A2 scope* | N/A |
| `C1-NF1` | Privacy | **Implemented** | `users` schema without address (`backend/src/db.ts`), no `geolocation` call, minimal JWT payload | `tests/unit/privacy.test.ts` |
| `C1-NF2` | Payment security | **Deferred** | *Excluded from the A2 scope* | N/A |
| `C2-NF1` | Map performance | **Implemented** | Index `idx_farms_status` on `farms(status)` (`backend/src/db.ts`) | `tests/integration/perf.test.ts` |
| `C2-NF2` | Notification delay | **Implemented** | Synchronous insert in `NotificationService` | `tests/integration/perf.test.ts` |
| `C3-NF1` | Storefront ergonomics | **Implemented** | Unified journey in `FarmEditor.vue` | `tests/e2e/farmer-flow.spec.ts` |

## 2. Deviations documented against Assignment 1

1. **Complete removal of online payment (Stripe) and escrow:** To focus the 4-week prototype on the core business value (map-based discovery without GPS and basket negotiation without stock management), the Stripe integration (`C1-F5`, `C3-F4`, `C3-F5`, `C1-NF2`) has been deferred.
2. **Internal notifications instead of external e-mails:** `C3-F2` is implemented through a notification bell persisted in SQLite rather than SMTP e-mail delivery. The server architecture nevertheless uses a `NotificationChannel` interface allowing an e-mail connector to be added later.
3. **Automatic geocoding on farm creation:** In addition to `C2-F1`, the server automatically derives the farm's GPS coordinates through the Swiss `geo.admin.ch` API (with a fallback to Nominatim) from the address entered by the producer.
4. **Local storage of banners:** Banner photos (`C2-F1`) are uploaded via `multer` and served from the server's local file system (`backend/uploads/`), without resorting to external cloud storage.
