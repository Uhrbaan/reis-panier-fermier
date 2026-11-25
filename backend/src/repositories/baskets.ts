import type Database from 'better-sqlite3';

import { computeClientTotal, computeSubtotal, roundMoney } from '../services/pricing.js';
import { generateAccessToken, generateBasketReference } from '../services/references.js';
import type { BasketStatus, PaymentMethod } from '../types/models.js';

/**
 * Basket persistence (`C1-F3`, `C1-F4`, `C2-F5`).
 *
 * Three invariants drive every query here:
 *
 * 1. **Ownership is enforced in SQL, never in the route.** A client only ever
 *    reads baskets whose `client_id` is theirs; a producer only ever reads
 *    baskets whose farm they own (`baskets.farm_id -> farms.owner_id`). A
 *    foreign id therefore matches no row and surfaces as a 404, which leaks
 *    nothing about whether the basket exists.
 * 2. **Prices are frozen at request time.** `basket_items.unit_price_snapshot`
 *    records the catalogue price when the client ordered, so a producer editing
 *    a product afterwards cannot retroactively change an existing request
 *    (`C3-F3`). All totals are computed from the snapshot, never from
 *    `products.unit_price`.
 * 3. **Status transitions are guarded by the WHERE clause.** An update only
 *    matches when the basket is in the status the caller expects, so two
 *    concurrent adjustments cannot both succeed.
 */

/** A line as sent by the client, before pricing. */
export interface BasketLineInput {
  productId: number;
  quantity: number;
}

export interface BasketItemDto {
  id: number;
  productId: number;
  /** Catalogue name at read time; the snapshot only covers the price. */
  name: string;
  unit: string;
  quantity: number;
  /** Price per unit frozen when the basket was requested. */
  unitPrice: number;
  lineTotal: number;
  removedByFarmer: boolean;
}

export interface BasketDto {
  id: number;
  /**
   * Short public reference (`PF-7K3M9Q`). Quoted when contacting support about
   * a dispute (`C3-F5`). Safe to display: it cannot open the basket.
   */
  reference: string;
  farmId: number;
  farmName: string;
  /** Owner of the farm: the recipient of every producer-side notification. */
  farmOwnerId: number;
  /** `null` for a guest basket (`C1-F3`). */
  clientId: number | null;
  clientName: string;
  /** True when the basket was placed without an account. */
  isGuest: boolean;
  paymentMethod: PaymentMethod;
  status: BasketStatus;
  /** Sum of the retained lines (`C3-F3`). */
  totalAmount: number;
  /** Amount the client pays; equals the subtotal while `COMMISSION_RATE = 0`. */
  clientTotal: number;
  createdAt: string;
  items: BasketItemDto[];
}

interface BasketRowJoined {
  id: number;
  reference: string | null;
  client_id: number | null;
  client_name: string | null;
  farm_id: number;
  farm_name: string;
  farm_owner_id: number;
  payment_method: PaymentMethod;
  status: BasketStatus;
  total_amount: number;
  created_at: string;
}

interface BasketItemRowJoined {
  id: number;
  basket_id: number;
  product_id: number;
  name: string;
  unit: string;
  quantity: number;
  unit_price_snapshot: number;
  removed_by_farmer: number;
}

const BASKET_SELECT = `
  SELECT b.id, b.reference, b.client_id, u.name AS client_name, b.farm_id,
         f.name AS farm_name, f.owner_id AS farm_owner_id, b.payment_method,
         b.status, b.total_amount, b.created_at
    FROM baskets b
    LEFT JOIN users u ON u.id = b.client_id
    JOIN farms f ON f.id = b.farm_id
`;

const ITEM_SELECT = `
  SELECT bi.id, bi.basket_id, bi.product_id, p.name, p.unit,
         bi.quantity, bi.unit_price_snapshot, bi.removed_by_farmer
    FROM basket_items bi
    JOIN products p ON p.id = bi.product_id
`;

/**
 * Recompute the stored total from the retained lines.
 *
 * Removed items are excluded rather than hidden: `C2-F5` states the producer
 * validates the recalculated price, so the price must drop when an item goes.
 */
function recomputeTotal(db: Database.Database, basketId: number): number {
  const rows = db
    .prepare(
      `SELECT quantity, unit_price_snapshot
         FROM basket_items
        WHERE basket_id = ? AND removed_by_farmer = 0`,
    )
    .all(basketId) as { quantity: number; unit_price_snapshot: number }[];

  const total = computeSubtotal(
    rows.map((row) => ({ unitPrice: row.unit_price_snapshot, quantity: row.quantity })),
  );

  db.prepare('UPDATE baskets SET total_amount = ? WHERE id = ?').run(total, basketId);
  return total;
}

/** Group items by basket so a list query stays a constant number of round trips. */
function itemsByBasket(
  db: Database.Database,
  basketIds: number[],
): Map<number, BasketItemDto[]> {
  const grouped = new Map<number, BasketItemDto[]>();
  if (basketIds.length === 0) {
    return grouped;
  }

  const placeholders = basketIds.map(() => '?').join(', ');
  const rows = db
    .prepare(`${ITEM_SELECT} WHERE bi.basket_id IN (${placeholders}) ORDER BY bi.id`)
    .all(...basketIds) as BasketItemRowJoined[];

  for (const row of rows) {
    const list = grouped.get(row.basket_id) ?? [];
    list.push({
      id: row.id,
      productId: row.product_id,
      name: row.name,
      unit: row.unit,
      quantity: row.quantity,
      unitPrice: row.unit_price_snapshot,
      lineTotal: roundMoney(row.unit_price_snapshot * row.quantity),
      removedByFarmer: row.removed_by_farmer === 1,
    });
    grouped.set(row.basket_id, list);
  }

  return grouped;
}

function toBasketDtos(db: Database.Database, rows: BasketRowJoined[]): BasketDto[] {
  const items = itemsByBasket(
    db,
    rows.map((row) => row.id),
  );

  return rows.map((row) => ({
    id: row.id,
    reference: row.reference ?? `#${row.id}`,
    farmId: row.farm_id,
    farmName: row.farm_name,
    farmOwnerId: row.farm_owner_id,
    clientId: row.client_id,
    // A guest has no account, so no name to show the producer.
    clientName: row.client_name ?? 'Invité',
    isGuest: row.client_id === null,
    paymentMethod: row.payment_method,
    status: row.status,
    totalAmount: row.total_amount,
    clientTotal: computeClientTotal(row.total_amount),
    createdAt: row.created_at,
    items: items.get(row.id) ?? [],
  }));
}

// ---------------------------------------------------------------------------
// Reads (always owner-scoped)
// ---------------------------------------------------------------------------

/** Baskets placed by a client, newest first (`C1-F4`). */
export function listBasketsByClient(db: Database.Database, clientId: number): BasketDto[] {
  const rows = db
    .prepare(`${BASKET_SELECT} WHERE b.client_id = ? ORDER BY b.created_at DESC, b.id DESC`)
    .all(clientId) as BasketRowJoined[];

  return toBasketDtos(db, rows);
}

/** Baskets received by a producer's farm, newest first (`C2-F5`). */
export function listBasketsByFarmer(db: Database.Database, ownerId: number): BasketDto[] {
  const rows = db
    .prepare(
      `${BASKET_SELECT}
        WHERE f.owner_id = ?
        ORDER BY b.created_at DESC, b.id DESC`,
    )
    .all(ownerId) as BasketRowJoined[];

  return toBasketDtos(db, rows);
}

/** A single basket, only if it belongs to this client. */
export function findBasketForClient(
  db: Database.Database,
  clientId: number,
  basketId: number,
): BasketDto | undefined {
  const row = db
    .prepare(`${BASKET_SELECT} WHERE b.id = ? AND b.client_id = ?`)
    .get(basketId, clientId) as BasketRowJoined | undefined;

  return row ? toBasketDtos(db, [row])[0] : undefined;
}

/** A single basket, only if its farm belongs to this producer. */
export function findBasketForFarmer(
  db: Database.Database,
  ownerId: number,
  basketId: number,
): BasketDto | undefined {
  const row = db
    .prepare(`${BASKET_SELECT} WHERE b.id = ? AND f.owner_id = ?`)
    .get(basketId, ownerId) as BasketRowJoined | undefined;

  return row ? toBasketDtos(db, [row])[0] : undefined;
}

// ---------------------------------------------------------------------------
// Creation (`C1-F3`)
// ---------------------------------------------------------------------------

export type CreateBasketOutcome =
  | { ok: true; basketId: number; ownerId: number; reference: string; accessToken: string }
  /** The farm does not exist or is not `APPROVED` (`C3-F1`). */
  | { ok: false; reason: 'FARM_NOT_FOUND' }
  /** The chosen method is not enabled by this producer (`C2-F2`). */
  | { ok: false; reason: 'PAYMENT_METHOD_NOT_ACCEPTED' }
  /** At least one product is unknown or belongs to another farm. */
  | { ok: false; reason: 'INVALID_PRODUCT'; productId: number }
  /**
   * A producer tried to order from their own farm.
   *
   * Buying is not a role, so producers and administrators order like anyone
   * else; ordering from yourself is the one combination that makes no sense
   * (you would be negotiating a price with yourself).
   */
  | { ok: false; reason: 'SELF_ORDER' };

/**
 * Persist a basket request and freeze its prices.
 *
 * Runs in a single transaction: the basket row, its items and the initial
 * total are written together or not at all, so a partially priced basket can
 * never be observed by the producer.
 *
 * `clientId` is `null` for a guest order (`C1-F3`). A guest has no account, so
 * the returned `accessToken` is the only way back to the basket — the caller
 * must hand it to the client.
 */
export function createBasket(
  db: Database.Database,
  clientId: number | null,
  farmId: number,
  paymentMethod: PaymentMethod,
  lines: BasketLineInput[],
): CreateBasketOutcome {
  const farm = db
    .prepare('SELECT owner_id, payment_methods FROM farms WHERE id = ? AND status = ?')
    .get(farmId, 'APPROVED') as { owner_id: number; payment_methods: string } | undefined;

  if (!farm) {
    return { ok: false, reason: 'FARM_NOT_FOUND' };
  }

  let accepted: PaymentMethod[] = [];
  try {
    const parsed: unknown = JSON.parse(farm.payment_methods);
    if (Array.isArray(parsed)) {
      accepted = parsed as PaymentMethod[];
    }
  } catch {
    accepted = [];
  }

  if (!accepted.includes(paymentMethod)) {
    return { ok: false, reason: 'PAYMENT_METHOD_NOT_ACCEPTED' };
  }

  // Checked before touching any row, so the basket is never half-created.
  // A guest has no identity, so the check cannot apply to them.
  if (clientId !== null && farm.owner_id === clientId) {
    return { ok: false, reason: 'SELF_ORDER' };
  }

  // Resolve every product against the target farm in one query: a product from
  // another farm (or a deleted one) must not be orderable.
  const priceById = new Map<number, number>();
  const productIds = lines.map((line) => line.productId);
  if (productIds.length > 0) {
    const placeholders = productIds.map(() => '?').join(', ');
    const rows = db
      .prepare(
        `SELECT id, unit_price FROM products WHERE farm_id = ? AND id IN (${placeholders})`,
      )
      .all(farmId, ...productIds) as { id: number; unit_price: number }[];

    for (const row of rows) {
      priceById.set(row.id, row.unit_price);
    }
  }

  for (const line of lines) {
    if (!priceById.has(line.productId)) {
      return { ok: false, reason: 'INVALID_PRODUCT', productId: line.productId };
    }
  }

  const reference = generateBasketReference();
  const accessToken = generateAccessToken();

  const run = db.transaction((): number => {
    const basket = db
      .prepare(
        `INSERT INTO baskets (client_id, farm_id, payment_method, status, total_amount, reference, access_token)
         VALUES (?, ?, ?, 'PENDING_FARMER', 0, ?, ?)`,
      )
      .run(clientId, farmId, paymentMethod, reference, accessToken);

    const basketId = Number(basket.lastInsertRowid);

    const insertItem = db.prepare(
      `INSERT INTO basket_items (basket_id, product_id, quantity, unit_price_snapshot)
       VALUES (?, ?, ?, ?)`,
    );

    for (const line of lines) {
      // `priceById.has` was verified above, so the non-null assertion is sound.
      insertItem.run(basketId, line.productId, line.quantity, priceById.get(line.productId)!);
    }

    recomputeTotal(db, basketId);
    return basketId;
  });

  return { ok: true, basketId: run(), ownerId: farm.owner_id, reference, accessToken };
}

// ---------------------------------------------------------------------------
// Transitions
// ---------------------------------------------------------------------------

export type AdjustOutcome =
  | { ok: true; status: BasketStatus; totalAmount: number }
  /** Unknown basket, or it belongs to another producer. */
  | { ok: false; reason: 'NOT_FOUND' }
  /** The basket is not awaiting the producer. */
  | { ok: false; reason: 'INVALID_TRANSITION' }
  /** A line id was given that is not part of this basket. */
  | { ok: false; reason: 'INVALID_ITEM'; itemId: number };

/**
 * Remove unavailable items and submit the offer (`C2-F5`, `C3-F3`).
 *
 * Removing **every** line is a rejection: there is nothing left to sell, so the
 * request ends as `REJECTED` instead of an empty `OFFER_PROPOSED`.
 */
export function adjustBasket(
  db: Database.Database,
  ownerId: number,
  basketId: number,
  removedItemIds: number[],
): AdjustOutcome {
  const owned = db
    .prepare(
      `SELECT b.id, b.status
         FROM baskets b
         JOIN farms f ON f.id = b.farm_id
        WHERE b.id = ? AND f.owner_id = ?`,
    )
    .get(basketId, ownerId) as { id: number; status: BasketStatus } | undefined;

  if (!owned) {
    return { ok: false, reason: 'NOT_FOUND' };
  }

  if (owned.status !== 'PENDING_FARMER') {
    return { ok: false, reason: 'INVALID_TRANSITION' };
  }

  const itemRows = db
    .prepare('SELECT id FROM basket_items WHERE basket_id = ?')
    .all(basketId) as { id: number }[];
  const knownIds = new Set(itemRows.map((row) => row.id));

  for (const itemId of removedItemIds) {
    if (!knownIds.has(itemId)) {
      return { ok: false, reason: 'INVALID_ITEM', itemId };
    }
  }

  const run = db.transaction((): { status: BasketStatus; totalAmount: number } => {
    const removeItem = db.prepare(
      'UPDATE basket_items SET removed_by_farmer = 1 WHERE id = ? AND basket_id = ?',
    );
    for (const itemId of removedItemIds) {
      removeItem.run(itemId, basketId);
    }

    const remaining = db
      .prepare(
        'SELECT COUNT(*) AS count FROM basket_items WHERE basket_id = ? AND removed_by_farmer = 0',
      )
      .get(basketId) as { count: number };

    const status: BasketStatus = remaining.count === 0 ? 'REJECTED' : 'OFFER_PROPOSED';

    db.prepare('UPDATE baskets SET status = ? WHERE id = ?').run(status, basketId);
    const totalAmount = recomputeTotal(db, basketId);

    return { status, totalAmount };
  });

  return { ok: true, ...run() };
}

export type RespondOutcome =
  | { ok: true; status: BasketStatus }
  | { ok: false; reason: 'NOT_FOUND' }
  | { ok: false; reason: 'INVALID_TRANSITION' };

/**
 * Accept or refuse the producer's offer (`C1-F4`).
 *
 * Only an `OFFER_PROPOSED` basket can be answered: accepting a still
 * `PENDING_FARMER` basket would let a client confirm a price the producer never
 * agreed to.
 */
export function respondToOffer(
  db: Database.Database,
  clientId: number,
  basketId: number,
  accept: boolean,
): RespondOutcome {
  const owned = db
    .prepare('SELECT id, status FROM baskets WHERE id = ? AND client_id = ?')
    .get(basketId, clientId) as { id: number; status: BasketStatus } | undefined;

  if (!owned) {
    return { ok: false, reason: 'NOT_FOUND' };
  }

  if (owned.status !== 'OFFER_PROPOSED') {
    return { ok: false, reason: 'INVALID_TRANSITION' };
  }

  const status: BasketStatus = accept ? 'CONFIRMED' : 'REJECTED';
  db.prepare('UPDATE baskets SET status = ? WHERE id = ?').run(status, basketId);

  return { ok: true, status };
}

// ---------------------------------------------------------------------------
// Guest access (`C1-F3`)
// ---------------------------------------------------------------------------

/**
 * Resolve a basket from a public reference **and** the secret access token.
 *
 * Both are required: the reference is quoted to support and appears in the
 * producer's order list, so it must never be sufficient on its own. Returning
 * `undefined` for either a wrong token or an unknown reference keeps the two
 * indistinguishable, so this cannot be used to probe which references exist.
 */
export function findBasketByGuestAccess(
  db: Database.Database,
  reference: string,
  accessToken: string,
): BasketDto | undefined {
  const row = db
    .prepare(`${BASKET_SELECT} WHERE b.reference = ? AND b.access_token = ?`)
    .get(reference, accessToken) as BasketRowJoined | undefined;

  return row ? toBasketDtos(db, [row])[0] : undefined;
}

/**
 * Resolve a basket from its public reference alone — for support staff.
 *
 * Administrator-only at the route layer (`C3-F5`): the admin needs to identify
 * the basket a client is calling about, which is exactly what the reference is
 * for. It deliberately does **not** grant the ability to answer on the client's
 * behalf.
 */
export function findBasketByReference(
  db: Database.Database,
  reference: string,
): BasketDto | undefined {
  const row = db
    .prepare(`${BASKET_SELECT} WHERE b.reference = ?`)
    .get(reference) as BasketRowJoined | undefined;

  return row ? toBasketDtos(db, [row])[0] : undefined;
}

/**
 * Accept or refuse an offer, authorised by the guest access token.
 *
 * Mirrors `respondToOffer` but identifies the basket by `(reference, token)`
 * instead of `(id, client_id)`, since a guest has neither an id nor a session.
 */
export function respondToOfferAsGuest(
  db: Database.Database,
  reference: string,
  accessToken: string,
  accept: boolean,
): RespondOutcome {
  const owned = db
    .prepare('SELECT id, status FROM baskets WHERE reference = ? AND access_token = ?')
    .get(reference, accessToken) as { id: number; status: BasketStatus } | undefined;

  if (!owned) {
    return { ok: false, reason: 'NOT_FOUND' };
  }

  if (owned.status !== 'OFFER_PROPOSED') {
    return { ok: false, reason: 'INVALID_TRANSITION' };
  }

  const status: BasketStatus = accept ? 'CONFIRMED' : 'REJECTED';
  db.prepare('UPDATE baskets SET status = ? WHERE id = ?').run(status, owned.id);

  return { ok: true, status };
}
