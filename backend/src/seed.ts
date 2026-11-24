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
    insertUser(db, { ...SEED_ADMIN, password_hash: passwordHash, role: 'ADMIN' });
    insertUser(db, { ...SEED_CLIENT, password_hash: passwordHash, role: 'CLIENT' });

    for (const farmer of SEED_FARM_USERS) {
      const ownerId = insertUser(db, {
        name: farmer.name,
        email: farmer.email,
        password_hash: passwordHash,
        role: 'FARMER',
      });
      const farmId = insertFarm(db, ownerId, farmer.farm);
      for (const product of farmer.farm.products) {
        insertProduct(db, farmId, product);
      }
    }
  });

  seed();
  return true;
}
