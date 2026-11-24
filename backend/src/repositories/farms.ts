import type Database from 'better-sqlite3';

import { renderDescription } from '../services/markdown.js';
import type { FarmStatus, PaymentMethod, ProductRow } from '../types/models.js';

export interface ProductDto {
  id: number;
  farmId: number;
  name: string;
  unit: string;
  unitPrice: number;
}

/** JSON shape returned by the public client endpoints (camelCase for the SPA). */
export interface FarmDto {
  id: number;
  name: string;
  /** Raw Markdown as typed by the producer — kept for the editor. */
  description: string;
  /** Sanitised HTML rendition served to clients (`ADR-04`). */
  descriptionHtml: string;
  address: string;
  latitude: number;
  longitude: number;
  bannerUrl: string | null;
  openingHours: string;
  paymentMethods: PaymentMethod[];
  status: FarmStatus;
  products: ProductDto[];
}

interface FarmRow {
  id: number;
  name: string;
  description: string;
  description_html: string;
  address: string;
  latitude: number;
  longitude: number;
  banner_url: string | null;
  opening_hours: string;
  payment_methods: string;
  status: FarmStatus;
}

interface ProductRowShort {
  id: number;
  farm_id: number;
  name: string;
  unit: string;
  unit_price: number;
}

const FARM_COLUMNS =
  'id, name, description, description_html, address, latitude, longitude, banner_url, opening_hours, payment_methods, status';

/** `payment_methods` is a JSON array text column (ADR-01); never trust its content. */
function parsePaymentMethods(raw: string): PaymentMethod[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter(
      (value): value is PaymentMethod =>
        value === 'CASH' || value === 'TWINT_FARM' || value === 'CARD_FARM',
    );
  } catch {
    return [];
  }
}

function toProductDto(row: ProductRowShort): ProductDto {
  return {
    id: row.id,
    farmId: row.farm_id,
    name: row.name,
    unit: row.unit,
    unitPrice: row.unit_price,
  };
}

function toFarmDto(row: FarmRow, products: ProductDto[]): FarmDto {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    descriptionHtml: row.description_html,
    address: row.address,
    latitude: row.latitude,
    longitude: row.longitude,
    bannerUrl: row.banner_url,
    openingHours: row.opening_hours,
    paymentMethods: parsePaymentMethods(row.payment_methods),
    status: row.status,
    products,
  };
}

function productsByFarm(db: Database.Database, farmIds: number[]): Map<number, ProductDto[]> {
  const grouped = new Map<number, ProductDto[]>();
  if (farmIds.length === 0) {
    return grouped;
  }

  const placeholders = farmIds.map(() => '?').join(', ');
  const rows = db
    .prepare(
      `SELECT id, farm_id, name, unit, unit_price
         FROM products
        WHERE farm_id IN (${placeholders})
        ORDER BY name`,
    )
    .all(...farmIds) as ProductRowShort[];

  for (const row of rows) {
    const list = grouped.get(row.farm_id) ?? [];
    list.push(toProductDto(row));
    grouped.set(row.farm_id, list);
  }
  return grouped;
}

/**
 * Public map listing (`C1-F1`): only `APPROVED` farms are ever returned, so a
 * pending or rejected storefront can never leak onto the map (`C3-F1`).
 */
export function listApprovedFarms(db: Database.Database): FarmDto[] {
  const rows = db
    .prepare(`SELECT ${FARM_COLUMNS} FROM farms WHERE status = 'APPROVED' ORDER BY name`)
    .all() as FarmRow[];

  const products = productsByFarm(
    db,
    rows.map((row) => row.id),
  );

  return rows.map((row) => toFarmDto(row, products.get(row.id) ?? []));
}

/** Public storefront detail (`C1-F2`). Returns `undefined` unless `APPROVED`. */
export function findApprovedFarmById(db: Database.Database, id: number): FarmDto | undefined {
  const row = db
    .prepare(`SELECT ${FARM_COLUMNS} FROM farms WHERE id = ? AND status = 'APPROVED'`)
    .get(id) as FarmRow | undefined;

  if (!row) {
    return undefined;
  }

  const products = productsByFarm(db, [row.id]);
  return toFarmDto(row, products.get(row.id) ?? []);
}

// ---------------------------------------------------------------------------
// Producer area (`C2-F1`, `C2-F4`)
//
// Every function below is scoped by `owner_id`. The route layer passes
// `req.user.id`, so a producer can never read or mutate another producer's
// storefront (`C2-F1` ownership isolation).
// ---------------------------------------------------------------------------

/** The storefront owned by a producer, or `undefined` when none exists yet. */
export function findFarmByOwnerId(
  db: Database.Database,
  ownerId: number,
): FarmDto | undefined {
  const row = db
    .prepare(`SELECT ${FARM_COLUMNS} FROM farms WHERE owner_id = ?`)
    .get(ownerId) as FarmRow | undefined;

  if (!row) {
    return undefined;
  }

  const products = productsByFarm(db, [row.id]);
  return toFarmDto(row, products.get(row.id) ?? []);
}

export interface FarmWriteInput {
  name: string;
  description: string;
  address: string;
  latitude: number;
  longitude: number;
  bannerUrl: string | null;
  openingHours: string;
  paymentMethods: PaymentMethod[];
}

/**
 * Create a storefront. Always starts `PENDING_APPROVAL` so it stays hidden from
 * the public map until an admin validates it (`C2-F1`, `C3-F1`).
 */
export function createFarm(
  db: Database.Database,
  ownerId: number,
  input: FarmWriteInput,
): number {
  const result = db
    .prepare(
      `INSERT INTO farms
         (owner_id, name, description, description_html, address, latitude, longitude,
          banner_url, opening_hours, payment_methods, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING_APPROVAL')`,
    )
    .run(
      ownerId,
      input.name,
      input.description,
      renderDescription(input.description),
      input.address,
      input.latitude,
      input.longitude,
      input.bannerUrl,
      input.openingHours,
      JSON.stringify(input.paymentMethods),
    );

  return Number(result.lastInsertRowid);
}

/**
 * Update a storefront, scoped to its owner.
 *
 * Status handling (`C2-F4`, `C3-F1`):
 *  - `APPROVED` stays `APPROVED`: producer edits go live immediately.
 *  - `REJECTED` goes back to `PENDING_APPROVAL`, so a corrected storefront
 *    returns to the admin queue instead of staying invisible forever.
 *  - `PENDING_APPROVAL` stays `PENDING_APPROVAL`.
 *
 * @returns `false` when no farm belongs to this owner (route answers `404`).
 */
export function updateFarm(
  db: Database.Database,
  ownerId: number,
  input: FarmWriteInput,
): boolean {
  const result = db
    .prepare(
      `UPDATE farms
          SET name = ?,
              description = ?,
              description_html = ?,
              address = ?,
              latitude = ?,
              longitude = ?,
              banner_url = ?,
              opening_hours = ?,
              payment_methods = ?,
              status = CASE status WHEN 'REJECTED' THEN 'PENDING_APPROVAL' ELSE status END
        WHERE owner_id = ?`,
    )
    .run(
      input.name,
      input.description,
      renderDescription(input.description),
      input.address,
      input.latitude,
      input.longitude,
      input.bannerUrl,
      input.openingHours,
      JSON.stringify(input.paymentMethods),
      ownerId,
    );

  return result.changes > 0;
}

/** Current banner path, so a `PUT` without a new upload keeps the old image. */
export function findBannerUrlByOwnerId(
  db: Database.Database,
  ownerId: number,
): string | null | undefined {
  const row = db
    .prepare('SELECT banner_url FROM farms WHERE owner_id = ?')
    .get(ownerId) as { banner_url: string | null } | undefined;

  return row ? row.banner_url : undefined;
}

// ---------------------------------------------------------------------------
// Administration (`C3-F1`)
// ---------------------------------------------------------------------------

/** Farms awaiting validation, oldest first, so the admin queue is FIFO. */
export function listPendingFarms(db: Database.Database): FarmDto[] {
  const rows = db
    .prepare(`SELECT ${FARM_COLUMNS} FROM farms WHERE status = 'PENDING_APPROVAL' ORDER BY id`)
    .all() as FarmRow[];

  const products = productsByFarm(
    db,
    rows.map((row) => row.id),
  );

  return rows.map((row) => toFarmDto(row, products.get(row.id) ?? []));
}

/** Approve or reject a storefront (`C3-F1`). @returns `false` if the id is unknown. */
export function setFarmStatus(
  db: Database.Database,
  farmId: number,
  status: FarmStatus,
): boolean {
  const result = db.prepare('UPDATE farms SET status = ? WHERE id = ?').run(status, farmId);
  return result.changes > 0;
}

export type { ProductRow };
