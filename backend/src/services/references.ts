import { randomBytes, randomInt } from 'node:crypto';

/**
 * Human-facing basket references and guest access tokens.
 *
 * Two separate values on purpose:
 *
 * - `reference` is **short, readable and public**. The client quotes it when
 *   contacting support about a dispute (`C3-F5`), and the producer sees it in
 *   their order list. Knowing it must never grant access, otherwise forwarding
 *   an e-mail or reading a screen would expose someone's basket.
 * - `access_token` is the **secret capability** carried in a guest's access
 *   link. It is long and random, and it is the only thing that opens a guest
 *   basket.
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

/** Secret capability for a guest basket: 32 hex characters. */
export function generateAccessToken(): string {
  return randomBytes(16).toString('hex');
}

/** Shape check, so a malformed reference is rejected before it reaches SQL. */
export function isBasketReference(value: string): boolean {
  return new RegExp(`^${REFERENCE_PREFIX}[${REFERENCE_ALPHABET}]{${REFERENCE_LENGTH}}$`).test(value);
}
