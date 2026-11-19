/**
 * Domain types mirroring the SQLite schema declared in `specs/design.md` §3.
 * Status enums are contract-bound: never introduce values that are absent from
 * the CHECK constraints in `db.ts`.
 */

export const ROLES = ['CLIENT', 'FARMER', 'ADMIN'] as const;
export type Role = (typeof ROLES)[number];

export const FARM_STATUSES = ['PENDING_APPROVAL', 'APPROVED', 'REJECTED'] as const;
export type FarmStatus = (typeof FARM_STATUSES)[number];

export const BASKET_STATUSES = [
  'PENDING_FARMER',
  'OFFER_PROPOSED',
  'CONFIRMED',
  'REJECTED',
] as const;
export type BasketStatus = (typeof BASKET_STATUSES)[number];

/**
 * Farm-gate payments only (ADR-01): online payments / escrow are out of scope
 * for the A2 prototype (`C1-F5`, `C3-F4`, `C3-F5`, `C1-NF2`).
 */
export const FARM_GATE_PAYMENT_METHODS = ['CASH', 'TWINT_FARM', 'CARD_FARM'] as const;
export type PaymentMethod = (typeof FARM_GATE_PAYMENT_METHODS)[number];

/**
 * User shape that may leave the server. Deliberately contains no address,
 * city or coordinate fields (`C1-NF1`) and never the password hash.
 */
export interface PublicUser {
  id: number;
  name: string;
  email: string;
  role: Role;
}

/** Identity attached to `req.user` by the `requireAuth` middleware. */
export interface AuthUser extends PublicUser {}

export interface UserRow extends PublicUser {
  password_hash: string;
}

export interface FarmRow {
  id: number;
  owner_id: number;
  name: string;
  description: string;
  address: string;
  latitude: number;
  longitude: number;
  banner_url: string | null;
  opening_hours: string;
  /** Raw JSON array text, e.g. `["CASH","TWINT_FARM"]`. */
  payment_methods: string;
  status: FarmStatus;
}

export interface ProductRow {
  id: number;
  farm_id: number;
  name: string;
  unit: string;
  unit_price: number;
}

export interface BasketRow {
  id: number;
  client_id: number;
  farm_id: number;
  payment_method: string;
  status: BasketStatus;
  total_amount: number;
  created_at: string;
}

export interface BasketItemRow {
  id: number;
  basket_id: number;
  product_id: number;
  quantity: number;
  unit_price_snapshot: number;
  /** SQLite has no boolean type: `0` = kept, `1` = removed by the farmer. */
  removed_by_farmer: number;
}

export interface NotificationRow {
  id: number;
  user_id: number;
  message: string;
  basket_id: number | null;
  /** SQLite has no boolean type: `0` = unread, `1` = read. */
  is_read: number;
  created_at: string;
}

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value);
}

export function isFarmGatePaymentMethod(value: unknown): value is PaymentMethod {
  return (
    typeof value === 'string' && (FARM_GATE_PAYMENT_METHODS as readonly string[]).includes(value)
  );
}

/** Strip the password hash before sending a user over the wire. */
export function toPublicUser(user: UserRow): PublicUser {
  return { id: user.id, name: user.name, email: user.email, role: user.role };
}
