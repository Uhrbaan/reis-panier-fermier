import type Database from 'better-sqlite3';

import type { ProductRow } from '../types/models.js';

/**
 * Product catalogue writes (`C2-F3`).
 *
 * Products carry **no stock** column by design: availability is negotiated per
 * basket (`C2-F5`), never tracked as inventory.
 *
 * Every mutation is scoped through the owning farm (`products.farm_id ->
 * farms.owner_id`), so a producer can only touch products of their own
 * storefront (`C2-F1` ownership isolation). The route layer never passes a
 * `farm_id` it did not derive from `req.user.id`.
 */

export interface ProductWriteInput {
  name: string;
  unit: string;
  unitPrice: number;
}

/** camelCase shape the SPA consumes (`frontend/src/api.ts`). */
export interface ProductDto {
  id: number;
  farmId: number;
  name: string;
  unit: string;
  unitPrice: number;
}

/** Map a raw SQLite row to the wire DTO. Never leak snake_case to the client. */
export function toProductDto(row: ProductRow): ProductDto {
  return {
    id: row.id,
    farmId: row.farm_id,
    name: row.name,
    unit: row.unit,
    unitPrice: row.unit_price,
  };
}

/** The id of the farm owned by this producer, or `undefined` if none yet. */
function findOwnedFarmId(db: Database.Database, ownerId: number): number | undefined {
  const row = db
    .prepare('SELECT id FROM farms WHERE owner_id = ?')
    .get(ownerId) as { id: number } | undefined;
  return row?.id;
}

/**
 * Add a product to the producer's own catalogue.
 *
 * @returns the new product id, or `undefined` when the producer has no
 * storefront yet (the route answers `409`: create the storefront first).
 */
export function createProduct(
  db: Database.Database,
  ownerId: number,
  input: ProductWriteInput,
): number | undefined {
  const farmId = findOwnedFarmId(db, ownerId);
  if (farmId === undefined) {
    return undefined;
  }

  const result = db
    .prepare('INSERT INTO products (farm_id, name, unit, unit_price) VALUES (?, ?, ?, ?)')
    .run(farmId, input.name, input.unit, input.unitPrice);

  return Number(result.lastInsertRowid);
}

/** Fetch a product, but only if it belongs to this producer's farm. */
export function findOwnedProduct(
  db: Database.Database,
  ownerId: number,
  productId: number,
): ProductRow | undefined {
  const row = db
    .prepare(
      `SELECT p.id, p.farm_id, p.name, p.unit, p.unit_price
         FROM products p
         JOIN farms f ON f.id = p.farm_id
        WHERE p.id = ? AND f.owner_id = ?`,
    )
    .get(productId, ownerId) as ProductRow | undefined;

  return row;
}

/**
 * Update a product owned by this producer.
 * @returns `false` when the product does not exist or belongs to someone else.
 */
export function updateProduct(
  db: Database.Database,
  ownerId: number,
  productId: number,
  input: ProductWriteInput,
): boolean {
  const result = db
    .prepare(
      `UPDATE products
          SET name = ?, unit = ?, unit_price = ?
        WHERE id = ?
          AND farm_id IN (SELECT id FROM farms WHERE owner_id = ?)`,
    )
    .run(input.name, input.unit, input.unitPrice, productId, ownerId);

  return result.changes > 0;
}

/**
 * Delete a product owned by this producer.
 * @returns `false` when the product does not exist or belongs to someone else.
 */
export function deleteProduct(
  db: Database.Database,
  ownerId: number,
  productId: number,
): boolean {
  const result = db
    .prepare(
      `DELETE FROM products
        WHERE id = ?
          AND farm_id IN (SELECT id FROM farms WHERE owner_id = ?)`,
    )
    .run(productId, ownerId);

  return result.changes > 0;
}
