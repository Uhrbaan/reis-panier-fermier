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
