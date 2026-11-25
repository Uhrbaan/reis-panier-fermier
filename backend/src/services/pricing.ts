/**
 * Basket pricing (`C3-F3`).
 *
 * Kept as pure functions with no database access so the arithmetic is easy to
 * reason about and to re-verify: the route layer feeds in lines, the result is
 * persisted. Money is stored as SQLite `REAL`, so every result is rounded to
 * the rappen (2 decimals) to stop floating point drift from accumulating.
 */

/**
 * Platform commission applied to online payments only.
 *
 * Deliberately a named constant set to `0`: `ADR-01` excludes online payments
 * and escrow from the A2 prototype, and the farm-gate methods (`CASH`,
 * `TWINT_FARM`, `CARD_FARM`) are commission-free by definition. Keeping the
 * rate explicit means re-introducing `C1-F5` is a one-line change plus the
 * escrow flow, not a rewrite of the pricing path.
 */
export const COMMISSION_RATE = 0;

/** A line as far as pricing is concerned: how many units at what unit price. */
export interface PriceableLine {
  unitPrice: number;
  quantity: number;
}

/** Round to the rappen. */
export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Subtotal contributed by a single line. */
export function lineTotal(line: PriceableLine): number {
  return roundMoney(line.unitPrice * line.quantity);
}

/**
 * Producer subtotal `S = sum(price_i * quantity_i)` over the retained lines.
 *
 * Callers must pass only the lines that survived the producer's adjustment
 * (`C2-F5`): removed items are excluded from the price, not merely hidden.
 */
export function computeSubtotal(lines: PriceableLine[]): number {
  return roundMoney(lines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0));
}

/**
 * Amount actually charged to the client for a given subtotal.
 *
 * With `COMMISSION_RATE = 0` this equals the subtotal, which is the intended
 * A2 behaviour for all three farm-gate methods.
 */
export function computeClientTotal(subtotal: number): number {
  return roundMoney(subtotal * (1 + COMMISSION_RATE));
}

/** Commission earned by the platform on this subtotal. */
export function computeCommission(subtotal: number): number {
  return roundMoney(subtotal * COMMISSION_RATE);
}
