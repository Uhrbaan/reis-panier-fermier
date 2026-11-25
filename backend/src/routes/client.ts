import { Router, type Request, type RequestHandler, type Response } from 'express';

import { db } from '../db.js';
import { asyncHandler, optionalAuth } from '../middleware/auth.js';
import {
  createBasket,
  findBasketForClient,
  findBasketForGuestSession,
  listBasketsByClient,
  listBasketsByGuestSession,
  respondToOffer,
  respondToOfferAsGuestSession,
} from '../repositories/baskets.js';
import { findApprovedFarmById, listApprovedFarms } from '../repositories/farms.js';
import { findUserById } from '../repositories/users.js';
import { extractBearerToken, verifyToken } from '../services/jwt.js';
import {
  attachGuestSession,
  findGuestSessionByRequest,
} from '../services/guestSession.js';
import { notificationService } from '../services/notifications.js';
import { toPublicUser } from '../types/models.js';
import {
  parseBasketLines,
  parseBoolean,
  parseId,
  parseIdLike,
  parsePaymentMethod,
  routeParam,
} from '../services/validation.js';

/**
 * Client area: public browsing plus the authenticated basket flow.
 *
 * `GET /farms` and `GET /farms/:id` are intentionally unauthenticated: visitors
 * may browse the map and storefronts without an account. Only `APPROVED` farms
 * are exposed. The basket routes below are mounted with `requireAuth` on the
 * individual paths rather than on the whole router, so adding authentication
 * does not close the public map (`C1-F1`).
 */
export const clientRouter = Router();

function badRequest(res: Response, message: string): void {
  res.status(400).json({ error: 'BAD_REQUEST', message });
}

function notFound(res: Response, message: string): void {
  res.status(404).json({ error: 'NOT_FOUND', message });
}

clientRouter.get('/farms', (_req: Request, res: Response) => {
  res.json({ farms: listApprovedFarms(db) });
});

clientRouter.get('/farms/:id', (req: Request, res: Response) => {
  const id = Number(req.params.id);

  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: 'BAD_REQUEST', message: 'Invalid farm id.' });
    return;
  }

  const farm = findApprovedFarmById(db, id);

  if (!farm) {
    // Same answer for "does not exist" and "not approved": a pending
    // storefront must not be discoverable through this endpoint (`C3-F1`).
    res.status(404).json({ error: 'NOT_FOUND', message: 'Farm not found.' });
    return;
  }

  res.json({ farm });
});

// ---------------------------------------------------------------------------
// Baskets (`C1-F3`, `C1-F4`).
//
// Buying is **not** a role: any authenticated user may order, including a
// producer or an administrator, because they also buy food. The only thing
// forbidden is ordering from one's own farm (see `SELF_ORDER` below).
// ---------------------------------------------------------------------------

/**
 * Compose a basket request (`C1-F3`).
 *
 * **No account required.** Signed in → the basket belongs to the account.
 * Otherwise it belongs to this device's anonymous session (`ADR-10`), so the
 * visitor can come back to it without registering and without keeping a link.
 *
 * The server never trusts the prices sent by the SPA: it resolves every product
 * against the target farm and snapshots the catalogue price itself (`C3-F3`).
 */
clientRouter.post(
  '/baskets',
  optionalAuth,
  asyncHandler((req: Request, res: Response) => {
    const body = req.body as Record<string, unknown>;

    const farmId = parseIdLike(body.farmId);
    if (farmId === undefined) {
      badRequest(res, 'Invalid farmId.');
      return;
    }

    const paymentMethod = parsePaymentMethod(body.paymentMethod);
    if (!paymentMethod.ok) {
      badRequest(res, paymentMethod.message);
      return;
    }

    const lines = parseBasketLines(body.lines);
    if (!lines.ok) {
      badRequest(res, lines.message);
      return;
    }

    const userId = req.user?.id ?? null;

    // A signed-in user is identified by the JWT; anyone else gets (or already
    // has) a device session. The cookie is only issued when one is needed, so
    // a signed-in visitor never carries a pointless second identity.
    const guestSessionId = userId === null ? attachGuestSession(db, req, res) : null;

    const outcome = createBasket(db, userId, guestSessionId, farmId, paymentMethod.value, lines.value);

    if (!outcome.ok) {
      switch (outcome.reason) {
        case 'FARM_NOT_FOUND':
          // Same answer for "unknown" and "not approved" (`C3-F1`).
          notFound(res, 'Farm not found.');
          return;
        case 'PAYMENT_METHOD_NOT_ACCEPTED':
          badRequest(res, 'This farm does not accept the selected payment method.');
          return;
        case 'INVALID_PRODUCT':
          badRequest(res, `Product ${outcome.productId} is not part of this farm's catalogue.`);
          return;
        case 'SELF_ORDER':
          res.status(409).json({
            error: 'SELF_ORDER',
            message: 'You cannot order from your own farm.',
          });
          return;
      }
    }

    const basket =
      userId !== null
        ? findBasketForClient(db, userId, outcome.basketId)
        : findBasketForGuestSession(db, guestSessionId as number, outcome.basketId);

    // The producer learns about the request here (`C3-F2`). The notification is
    // written in the same transaction as the basket, so a basket can never
    // exist without the producer having been told about it.
    const who = req.user?.name ?? 'a guest';
    const amount = basket?.totalAmount.toFixed(2) ?? '0.00';

    db.transaction(() => {
      notificationService.notify(db, {
        userId: outcome.ownerId,
        message: `New basket request from ${who} (${amount} CHF, ${outcome.reference}).`,
        basketId: outcome.basketId,
      });
    })();

    res.status(201).json({ basket, reference: outcome.reference });
  }),
);

/**
 * Baskets belonging to this visitor (`C1-F4`).
 *
 * Works for an account *or* an anonymous device session, so "Mes paniers" is
 * useful before signing up. No cookie is issued here: listing baskets must not
 * conjure an identity out of nothing.
 */
clientRouter.get(
  '/baskets',
  optionalAuth,
  asyncHandler((req: Request, res: Response) => {
    if (req.user) {
      res.json({ baskets: listBasketsByClient(db, req.user.id) });
      return;
    }

    const session = findGuestSessionByRequest(db, req);
    res.json({
      baskets: session ? listBasketsByGuestSession(db, session.id) : [],
    });
  }),
);

/** Accept or refuse the producer's adjusted offer (`C1-F4`). */
clientRouter.patch(
  '/baskets/:id/respond',
  optionalAuth,
  asyncHandler((req: Request, res: Response) => {
    const basketId = parseId(req.params.id);
    if (basketId === undefined) {
      badRequest(res, 'Invalid basket id.');
      return;
    }

    const accept = parseBoolean((req.body as Record<string, unknown>).accept, 'accept');
    if (!accept.ok) {
      badRequest(res, accept.message);
      return;
    }

    const outcome = req.user
      ? respondToOffer(db, req.user.id, basketId, accept.value)
      : (() => {
          const session = findGuestSessionByRequest(db, req);
          return session
            ? respondToOfferAsGuestSession(db, session.id, basketId, accept.value)
            : ({ ok: false, reason: 'NOT_FOUND' } as const);
        })();

    if (!outcome.ok) {
      if (outcome.reason === 'NOT_FOUND') {
        notFound(res, 'Basket not found.');
        return;
      }

      res.status(409).json({
        error: 'INVALID_TRANSITION',
        message: 'This basket is not awaiting your decision.',
      });
      return;
    }

    const basket = req.user
      ? findBasketForClient(db, req.user.id, basketId)
      : findBasketForGuestSession(db, findGuestSessionByRequest(db, req)?.id ?? -1, basketId);

    // The producer is told whether to prepare the order or drop it (`C3-F2`).
    if (basket) {
      db.transaction(() => {
        notificationService.notify(db, {
          userId: basket.farmOwnerId,
          message:
            outcome.status === 'CONFIRMED'
              ? `Basket ${basket.reference} was accepted by the client: prepare it for collection.`
              : `Basket ${basket.reference} was refused by the client.`,
          basketId,
        });
      })();
    }

    res.json({ basket });
  }),
);
