import express, { type Request, type Response } from 'express';
import cors from 'cors';

import { PORT } from './config/env.js';
import { db } from './db.js';
import { requireAuth, requireRole } from './middleware/auth.js';
import { seedDatabase } from './seed.js';

const app = express();

app.use(cors());
app.use(express.json());

// Seed the demo dataset on first boot only (idempotent).
if (seedDatabase(db)) {
  console.log('[db] Demo dataset seeded (1 admin, 1 client, 2 farms).');
}

/**
 * Temporary smoke routes proving the JWT middlewares are wired correctly.
 * They will be replaced by the real role routers in T2.2 / T3.2.
 */
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok' });
});

// 1. Any authenticated user
app.get('/api/client/hello', requireAuth, (req: Request, res: Response) => {
  res.json({ message: `Hello Client 🥕 (${req.user?.name})` });
});

// 2. Producer area — role isolation (`C2-F1` … `C2-F5`)
app.get('/api/farmer/hello', requireAuth, requireRole('FARMER'), (req: Request, res: Response) => {
  res.json({ message: `Hello Producteur 🚜 (${req.user?.name})` });
});

// 3. Admin area — role isolation (`C3-F1`)
app.get('/api/admin/hello', requireAuth, requireRole('ADMIN'), (req: Request, res: Response) => {
  res.json({ message: `Hello Admin 🛡️ (${req.user?.name})` });
});

app.listen(PORT, () => {
  console.log(`API PanierFermier démarrée sur http://localhost:${PORT}`);
});

export default app;
