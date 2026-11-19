import type Database from 'better-sqlite3';

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
  description: string;
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
  'id, name, description, address, latitude, longitude, banner_url, opening_hours, payment_methods, status';

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

export type { ProductRow };
