import { isFarmGatePaymentMethod, type PaymentMethod } from '../types/models.js';

/**
 * Request validation for the producer endpoints (`C2-F1` … `C2-F4`).
 *
 * Validation lives here rather than in a schema library: the payloads are small
 * and a course prototype does not warrant a runtime dependency. Every helper
 * returns either the cleaned value or an error message, and the route turns the
 * message into a `400 { error, message }` response.
 */

/** Upper bounds chosen to keep SQLite rows and the map popup reasonable. */
export const LIMITS = {
  name: 120,
  email: 254,
  address: 200,
  openingHours: 400,
  description: 4000,
  productName: 120,
  productUnit: 40,
  /** Upper bound per line; the SPA caps at 50, this is the server-side guard. */
  basketQuantity: 999,
  /** A basket longer than this is a mistake, not a grocery order. */
  basketLines: 100,
} as const;

export type ValidationResult<T> = { ok: true; value: T } | { ok: false; message: string };

function ok<T>(value: T): ValidationResult<T> {
  return { ok: true, value };
}

function fail<T>(message: string): ValidationResult<T> {
  return { ok: false, message };
}

/** Required single-line text field. */
export function requiredText(
  raw: unknown,
  field: string,
  maxLength: number,
): ValidationResult<string> {
  if (typeof raw !== 'string') {
    return fail(`${field} is required.`);
  }

  const value = raw.trim();
  if (!value) {
    return fail(`${field} is required.`);
  }

  if (value.length > maxLength) {
    return fail(`${field} must be at most ${maxLength} characters.`);
  }

  return ok(value);
}

/**
 * Required multi-line text field. Newlines are preserved because producers type
 * opening hours one line per day and Markdown relies on them.
 */
export function requiredMultiline(
  raw: unknown,
  field: string,
  maxLength: number,
): ValidationResult<string> {
  if (typeof raw !== 'string') {
    return fail(`${field} is required.`);
  }

  const value = raw.replace(/\r\n/g, '\n').trim();
  if (!value) {
    return fail(`${field} is required.`);
  }

  if (value.length > maxLength) {
    return fail(`${field} must be at most ${maxLength} characters.`);
  }

  return ok(value);
}

/**
 * Payment methods arrive as a JSON array (multipart) or a real array (JSON).
 * At least one farm-gate method is mandatory (`C2-F2`).
 */
export function parsePaymentMethods(raw: unknown): ValidationResult<PaymentMethod[]> {
  let parsed: unknown = raw;

  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return fail('paymentMethods must be a JSON array of payment methods.');
    }
  }

  if (!Array.isArray(parsed)) {
    return fail('paymentMethods must be a JSON array of payment methods.');
  }

  const methods: PaymentMethod[] = [];
  for (const entry of parsed) {
    if (!isFarmGatePaymentMethod(entry)) {
      return fail(
        'paymentMethods may only contain CASH, TWINT_FARM or CARD_FARM (on-site payments only).',
      );
    }
    if (!methods.includes(entry)) {
      methods.push(entry);
    }
  }

  if (methods.length === 0) {
    return fail('Select at least one on-site payment method.');
  }

  return ok(methods);
}

/** Positive, finite price in CHF. */
export function parseUnitPrice(raw: unknown): ValidationResult<number> {
  const value = typeof raw === 'string' ? Number(raw) : raw;

  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fail('unitPrice must be a number.');
  }

  if (value < 0) {
    return fail('unitPrice must be zero or positive.');
  }

  return ok(value);
}

/**
 * Parse a route parameter that must be a positive integer id.
 *
 * Express types route params as `string | string[] | undefined` (a repeated
 * param becomes an array), so anything that is not a single numeric string is
 * rejected here instead of reaching the SQL layer.
 */
export function parseId(raw: unknown): number | undefined {
  if (typeof raw !== 'string') {
    return undefined;
  }

  const value = Number(raw);
  return Number.isInteger(value) && value > 0 ? value : undefined;
}

/**
 * Like `parseId`, but also accepts a real JSON number.
 *
 * Route params are always strings, whereas ids in a JSON body (`farmId`) arrive
 * as numbers; this keeps both paths on the same validation rule.
 */
export function parseIdLike(raw: unknown): number | undefined {
  if (typeof raw === 'number') {
    return Number.isInteger(raw) && raw > 0 ? raw : undefined;
  }

  return parseId(raw);
}

/** A single farm-gate payment method chosen by the client (`C1-F3`). */
export function parsePaymentMethod(raw: unknown): ValidationResult<PaymentMethod> {
  if (!isFarmGatePaymentMethod(raw)) {
    return fail('paymentMethod must be CASH, TWINT_FARM or CARD_FARM (on-site payments only).');
  }

  return ok(raw);
}

/** A boolean flag from a JSON body (`respond` / `accept`). */
export function parseBoolean(raw: unknown, field: string): ValidationResult<boolean> {
  if (typeof raw !== 'boolean') {
    return fail(`${field} must be true or false.`);
  }

  return ok(raw);
}

export interface BasketLinePayload {
  productId: number;
  quantity: number;
}

/**
 * Parse the requested lines of a basket (`C1-F3`).
 *
 * Rejects duplicates instead of merging them: silently summing two lines for
 * the same product would make the request differ from what the client saw on
 * screen, and the SPA never produces duplicates.
 */
export function parseBasketLines(raw: unknown): ValidationResult<BasketLinePayload[]> {
  if (!Array.isArray(raw)) {
    return fail('lines must be an array of { productId, quantity }.');
  }

  if (raw.length === 0) {
    return fail('A basket must contain at least one item.');
  }

  if (raw.length > LIMITS.basketLines) {
    return fail(`A basket may contain at most ${LIMITS.basketLines} lines.`);
  }

  const lines: BasketLinePayload[] = [];
  const seen = new Set<number>();

  for (const entry of raw) {
    if (typeof entry !== 'object' || entry === null) {
      return fail('Each line must be an object with productId and quantity.');
    }

    const { productId, quantity } = entry as Record<string, unknown>;

    if (typeof productId !== 'number' || !Number.isInteger(productId) || productId <= 0) {
      return fail('Each line needs a valid productId.');
    }

    if (typeof quantity !== 'number' || !Number.isInteger(quantity) || quantity < 1) {
      return fail('Each line needs a quantity of at least 1.');
    }

    if (quantity > LIMITS.basketQuantity) {
      return fail(`Quantity may not exceed ${LIMITS.basketQuantity} per line.`);
    }

    if (seen.has(productId)) {
      return fail('The same product may not appear twice in a basket.');
    }

    seen.add(productId);
    lines.push({ productId, quantity });
  }

  return ok(lines);
}

/** Parse a list of basket item ids to remove (`C2-F5`). */
export function parseItemIds(raw: unknown): ValidationResult<number[]> {
  if (!Array.isArray(raw)) {
    return fail('removedItemIds must be an array of item ids.');
  }

  const ids: number[] = [];
  for (const entry of raw) {
    if (typeof entry !== 'number' || !Number.isInteger(entry) || entry <= 0) {
      return fail('removedItemIds must only contain valid item ids.');
    }
    if (!ids.includes(entry)) {
      ids.push(entry);
    }
  }

  return ok(ids);
}
