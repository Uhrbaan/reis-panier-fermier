/**
 * Standalone seed entry point: `npm run seed`.
 */
import db from '../src/db.js';
import { seedDatabase } from '../src/seed.js';

const inserted = seedDatabase(db);

if (inserted) {
  console.log('Database seeded: 1 admin, 1 client, 2 farmers with one farm each.');
} else {
  console.log('Users already exist — seeding skipped.');
}
