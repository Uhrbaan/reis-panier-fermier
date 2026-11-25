import type Database from 'better-sqlite3';

import { hashPassword } from './services/passwords.js';
import { renderDescription } from './services/markdown.js';
import { countUsers, insertUser } from './repositories/users.js';
import type { PaymentMethod } from './types/models.js';

/** Every demo account shares this password (documented in README §5). */
export const DEMO_PASSWORD = 'password123';

interface SeedProduct {
  name: string;
  unit: string;
  unit_price: number;
}

interface SeedFarm {
  name: string;
  description: string;
  address: string;
  latitude: number;
  longitude: number;
  banner_url: string | null;
  opening_hours: string;
  payment_methods: PaymentMethod[];
  status: 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED';
  products: SeedProduct[];
}

export interface SeedFarmUser {
  name: string;
  email: string;
  farm: SeedFarm;
}

export const SEED_ADMIN = { name: 'Sophie Baumann', email: 'sophie@example.ch' } as const;
export const SEED_CLIENT = { name: 'Clara Meylan', email: 'clara@example.ch' } as const;

/**
 * One farmer per farm: `GET /api/farmer/farm` assumes a single storefront per
 * producer, and SQL isolation filters on `owner_id = req.user.id`.
 * Farm 1 is APPROVED (visible on the map, `C1-F1`) and farm 2 stays
 * PENDING_APPROVAL so the admin workflow (`C3-F1`) is demoable immediately.
 */
export const SEED_FARM_USERS: SeedFarmUser[] = [
  {
    name: 'Marc Rochat',
    email: 'marc@example.ch',
    farm: {
      name: 'Ferme des Tilleuls',
      description:
        'Exploitation familiale aux portes de Fribourg. Légumes de saison en pleine terre, œufs frais de poules élevées en plein air et fromage d’alpage affiné dans notre cave.',
      address: 'Route de la Glâne 42, 1700 Fribourg',
      latitude: 46.7985,
      longitude: 7.145,
      banner_url: null,
      opening_hours: 'Mercredi 14:00–18:00, Samedi 09:00–12:00',
      payment_methods: ['CASH', 'TWINT_FARM'],
      status: 'APPROVED',
      products: [
        { name: 'Tomates cerises', unit: 'barquette 250 g', unit_price: 4.5 },
        { name: 'Fromage d’alpage', unit: 'pièce 200 g', unit_price: 9.0 },
        { name: 'Œufs frais', unit: 'boîte de 6', unit_price: 3.8 },
        { name: 'Miel de fleurs', unit: 'pot 500 g', unit_price: 12.0 },
      ],
    },
  },
  {
    name: 'Anna Perret',
    email: 'anna@example.ch',
    farm: {
      name: 'Ferme du Vully',
      description:
        'Verger et vignoble sur les coteaux du Vully. Pommes de garde, jus de pomme pressé à la ferme et cidre artisanal.',
      address: 'Chemin du Verger 8, 1786 Sugiez',
      latitude: 46.9611,
      longitude: 7.1264,
      banner_url: null,
      opening_hours: 'Vendredi 15:00–19:00',
      payment_methods: ['CASH', 'CARD_FARM'],
      status: 'PENDING_APPROVAL',
      products: [
        { name: 'Pommes de garde', unit: 'kg', unit_price: 3.2 },
        { name: 'Jus de pomme', unit: 'bouteille 1 L', unit_price: 5.5 },
        { name: 'Cidre artisanal', unit: 'bouteille 75 cl', unit_price: 11.0 },
      ],
    },
  },
];

function insertFarm(db: Database.Database, ownerId: number, farm: SeedFarm): number {
  const result = db
    .prepare(
      `INSERT INTO farms
         (owner_id, name, description, description_html, address, latitude, longitude, banner_url, opening_hours, payment_methods, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      ownerId,
      farm.name,
      farm.description,
      // Seeded descriptions go through the same rendering pipeline as
      // producer-submitted ones (`ADR-04`), so demo data is never unsanitised.
      renderDescription(farm.description),
      farm.address,
      farm.latitude,
      farm.longitude,
      farm.banner_url,
      farm.opening_hours,
      JSON.stringify(farm.payment_methods),
      farm.status,
    );
  return Number(result.lastInsertRowid);
}

function insertProduct(db: Database.Database, farmId: number, product: SeedProduct): void {
  // No stock column by design (`C2-F3`).
  db.prepare('INSERT INTO products (farm_id, name, unit, unit_price) VALUES (?, ?, ?, ?)').run(
    farmId,
    product.name,
    product.unit,
    product.unit_price,
  );
}

/**
 * Two demo baskets so the client and producer basket views are not empty on a
 * fresh checkout: one still awaiting the producer, one already adjusted.
 *
 * They go through the same tables the API writes, with the price snapshot taken
 * from the seeded catalogue, so the totals are consistent with `C3-F3`.
 */
function insertDemoBaskets(
  db: Database.Database,
  clientId: number,
  farmId: number,
): void {
  const products = db
    .prepare('SELECT id, unit_price FROM products WHERE farm_id = ? ORDER BY id')
    .all(farmId) as { id: number; unit_price: number }[];

  if (products.length < 2) {
    return;
  }

  const [first, second] = products as [
    { id: number; unit_price: number },
    { id: number; unit_price: number },
  ];

  const createBasket = (status: string, paymentMethod: string): number => {
    const basket = db
      .prepare(
        `INSERT INTO baskets (client_id, farm_id, payment_method, status, total_amount)
         VALUES (?, ?, ?, ?, 0)`,
      )
      .run(clientId, farmId, paymentMethod, status);

    return Number(basket.lastInsertRowid);
  };

  const insertItem = db.prepare(
    `INSERT INTO basket_items (basket_id, product_id, quantity, unit_price_snapshot, removed_by_farmer)
     VALUES (?, ?, ?, ?, ?)`,
  );

  const setTotal = (basketId: number): void => {
    const row = db
      .prepare(
        `SELECT COALESCE(SUM(quantity * unit_price_snapshot), 0) AS total
           FROM basket_items
          WHERE basket_id = ? AND removed_by_farmer = 0`,
      )
      .get(basketId) as { total: number };

    db.prepare('UPDATE baskets SET total_amount = ? WHERE id = ?').run(row.total, basketId);
  };

  // 1. Awaiting the producer.
  const pending = createBasket('PENDING_FARMER', 'CASH');
  insertItem.run(pending, first.id, 2, first.unit_price, 0);
  insertItem.run(pending, second.id, 1, second.unit_price, 0);
  setTotal(pending);

  // 2. Already adjusted: the second line was unavailable, so it is excluded
  //    from the total and the client is waiting to decide (`C2-F5`).
  const proposed = createBasket('OFFER_PROPOSED', 'TWINT_FARM');
  insertItem.run(proposed, first.id, 1, first.unit_price, 0);
  insertItem.run(proposed, second.id, 1, second.unit_price, 1);
  setTotal(proposed);
}

/**
 * Insert the demo dataset: 1 ADMIN, 1 CLIENT, 2 FARMERs with one farm each.
 * Idempotent: does nothing once any user exists, so it is safe to call on boot.
 *
 * @returns `true` when rows were inserted, `false` when seeding was skipped.
 */
export function seedDatabase(db: Database.Database): boolean {
  if (countUsers(db) > 0) {
    return false;
  }

  const passwordHash = hashPassword(DEMO_PASSWORD);

  const seed = db.transaction(() => {
    const adminId = insertUser(db, { ...SEED_ADMIN, password_hash: passwordHash, role: 'ADMIN' });
    void adminId;
    const clientId = insertUser(db, { ...SEED_CLIENT, password_hash: passwordHash, role: 'CLIENT' });

    const farms: { farmId: number; status: string }[] = [];

    for (const farmer of SEED_FARM_USERS) {
      const ownerId = insertUser(db, {
        name: farmer.name,
        email: farmer.email,
        password_hash: passwordHash,
        role: 'FARMER',
      });
      const farmId = insertFarm(db, ownerId, farmer.farm);
      farms.push({ farmId, status: farmer.farm.status });
      for (const product of farmer.farm.products) {
        insertProduct(db, farmId, product);
      }
    }

    // Demo baskets so both new views are non-empty on a fresh checkout.
    const approved = farms.find((entry) => entry.status === 'APPROVED');
    if (approved) {
      insertDemoBaskets(db, clientId, approved.farmId);
    }
  });

  seed();
  return true;
}
