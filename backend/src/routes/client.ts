import { Router, type Request, type RequestHandler, type Response } from 'express';

import { db } from '../db.js';
import { asyncHandler, requireAuth, requireRole } from '../middleware/auth.js';
import {
  createBasket,
  findBasketByGuestAccess,
  findBasketForClient,
  listBasketsByClient,
  respondToOffer,
  respondToOfferAsGuest,
} from '../repositories/baskets.js';
import { findApprovedFarmById, listApprovedFarms } from '../repositories/farms.js';
import { findUserById } from '../repositories/users.js';
import { extractBearerToken, verifyToken } from '../services/jwt.js';
import { notificationService } from '../services/notifications.js';
import { isBasketReference } from '../services/references.js';
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

const requireUser = requireAuth;

/**
 * Attach `req.user` when a valid token is present, but never reject.
 *
 * Used by basket creation: a signed-in user gets the basket attached to their
 * account, a visitor without a token gets a guest basket (`C1-F3`). Any failure
 * to verify the token is treated as "no user" rather than an error, so an
 * expired token cannot block a guest order.
 */
const optionalAuth: RequestHandler = (req, _res, next) => {
  const token = extractBearerToken(req.headers.authorization);
  if (!token) {
    next();
    return;
  }

  try {
    const user = findUserById(db, verifyToken(token).id);
    if (user) {
      req.user = toPublicUser(user);
    }
  } catch {
    // Ignored on purpose: see the doc comment above.
  }

  next();
};

/**
 * Compose a basket request (`C1-F3`).
 *
 * **No account required.** Signed in → the basket belongs to the account;
 * otherwise a guest basket is created and the response carries the reference
 * plus the secret access token that is the only way back to it.
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
    const outcome = createBasket(db, userId, farmId, paymentMethod.value, lines.value);

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

    // The basket is read back for both cases: the producer notification needs
    // the total, and a guest has no other way to see what was created.
    const basket = findBasketForClient(db, userId ?? -1, outcome.basketId) ??
      findBasketByGuestAccess(db, outcome.reference, outcome.accessToken);

    // The producer learns about the request here (`C3-F2`). The notification is
    // written in the same transaction as the basket, so a basket can never
    // exist without the producer having been told about it.
    const who = req.user?.name ?? 'a guest';
    const amount = basket?.totalAmount.toFixed(2) ?? '0.00';
    const reference = outcome.reference;

    db.transaction(() => {
      notificationService.notify(db, {
        userId: outcome.ownerId,
        message: `New basket request from ${who} (${amount} CHF, ${reference}).`,
        basketId: outcome.basketId,
      });
    })();

    // A guest cannot re-derive their basket from an account, so the token is
    // returned exactly once, here. Losing it means contacting support with the
    // reference.
    res.status(201).json({
      basket,
      reference: outcome.reference,
      accessToken: userId === null ? outcome.accessToken : undefined,
    });
  }),
);

/** Baskets placed by the connected client (`C1-F4`). */
clientRouter.get(
  '/baskets',
  requireUser,
  asyncHandler((req: Request, res: Response) => {
    res.json({ baskets: listBasketsByClient(db, req.user!.id) });
  }),
);

/** Accept or refuse the producer's adjusted offer (`C1-F4`). */
clientRouter.patch(
  '/baskets/:id/respond',
  requireUser,
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

    const outcome = respondToOffer(db, req.user!.id, basketId, accept.value);

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

    const basket = findBasketForClient(db, req.user!.id, basketId);

    // The producer is told whether to prepare the order or drop it (`C3-F2`).
    if (basket) {
      db.transaction(() => {
        notificationService.notify(db, {
          userId: basket.farmOwnerId,
          message:
            outcome.status === 'CONFIRMED'
              ? `Basket #${basketId} was accepted by the client: prepare it for collection.`
              : `Basket #${basketId} was refused by the client.`,
          basketId,
        });
      })();
    }

    res.json({ basket });
  }),
);

// ---------------------------------------------------------------------------
// Guest access (`C1-F3`, `C1-F4`)
//
// A guest has no session, so the basket is reached through its public
// `reference` plus the secret `token` issued at creation. The token is the
// capability: without it the reference alone reveals nothing.
// ---------------------------------------------------------------------------

/** Extract the capability token from the query string or the `X-Basket-Token` header. */
function guestToken(req: Request): string | undefined {
  const fromQuery = req.query.token;
  if (typeof fromQuery === 'string' && fromQuery.length > 0) {
    return fromQuery;
  }

  const fromHeader = req.headers['x-basket-token'];
  if (typeof fromHeader === 'string' && fromHeader.length > 0) {
    return fromHeader;
  }

  return undefined;
}

/** Read a guest basket (`C1-F4`). */
clientRouter.get(
  '/baskets/:reference',
  asyncHandler((req: Request, res: Response) => {
    const reference = routeParam(req.params.reference) ?? '';
    const token = guestToken(req);

    if (!isBasketReference(reference) || !token) {
      notFound(res, 'Basket not found.');
      return;
    }

    const basket = findBasketByGuestAccess(db, reference, token);
    if (!basket) {
      // Unknown reference, wrong token and a registered basket all answer the
      // same way, so this cannot be used to probe for references.
      notFound(res, 'Basket not found.');
      return;
    }

    res.json({ basket });
  }),
);

/** Accept or refuse an offer on a guest basket (`C1-F4`). */
clientRouter.patch(
  '/baskets/:reference/respond',
  asyncHandler((req: Request, res: Response) => {
    const reference = routeParam(req.params.reference) ?? '';
    const token = guestToken(req);

    if (!isBasketReference(reference) || !token) {
      notFound(res, 'Basket not found.');
      return;
    }

    const accept = parseBoolean((req.body as Record<string, unknown>).accept, 'accept');
    if (!accept.ok) {
      badRequest(res, accept.message);
      return;
    }

    const outcome = respondToOfferAsGuest(db, reference, token, accept.value);

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

    const basket = findBasketByGuestAccess(db, reference, token);

    // Notify the producer; there is no client bell to write to.
    if (basket) {
      db.transaction(() => {
        notificationService.notify(db, {
          userId: basket.farmOwnerId,
          message:
            outcome.status === 'CONFIRMED'
              ? `Basket ${reference} was accepted by the client: prepare it for collection.`
              : `Basket ${reference} was refused by the client.`,
          basketId: basket.id,
        });
      })();
    }

    res.json({ basket });
  }),
);
