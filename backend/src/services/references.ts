import { randomInt } from 'node:crypto';

/**
 * Human-facing basket references.
 *
 * `reference` is **short, readable and public**: the client quotes it when
 * contacting support about a dispute (`C3-F5`), and the producer sees it in
 * their order list. Knowing it grants nothing — access to a basket is decided
 * by ownership (an account) or by the device session cookie (`ADR-10`), never
 * by the reference.
 */

/**
 * Alphabet without look-alike characters (no `0`/`O`, `1`/`I`/`L`), because the
 * reference will be read aloud on the phone or copied by hand.
 */
const REFERENCE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

const REFERENCE_LENGTH = 6;
const REFERENCE_PREFIX = 'PF-';

/**
 * Generate a reference such as `PF-7K3M9Q`.
 *
 * `randomInt` is used rather than `Math.random`: the reference is public, but a
 * predictable sequence would still let someone enumerate other clients'
 * references, and there is no reason to make that easy.
 */
export function generateBasketReference(): string {
  let body = '';
  for (let i = 0; i < REFERENCE_LENGTH; i += 1) {
    body += REFERENCE_ALPHABET.charAt(randomInt(REFERENCE_ALPHABET.length));
  }

  return `${REFERENCE_PREFIX}${body}`;
}

/** Shape check, so a malformed reference is rejected before it reaches SQL. */
export function isBasketReference(value: string): boolean {
  return new RegExp(`^${REFERENCE_PREFIX}[${REFERENCE_ALPHABET}]{${REFERENCE_LENGTH}}$`).test(value);
}
