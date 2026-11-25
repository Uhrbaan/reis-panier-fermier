import express, { type NextFunction, type Request, type Response } from 'express';
import cors from 'cors';
import multer from 'multer';

import { IS_PRODUCTION, PORT } from './config/env.js';
import { db } from './db.js';
import { adminRouter } from './routes/admin.js';
import { authRouter } from './routes/auth.js';
import { clientRouter } from './routes/client.js';
import { demoRouter } from './routes/demo.js';
import { farmerRouter } from './routes/farmer.js';
import { notificationsRouter } from './routes/notifications.js';
import { seedDatabase } from './seed.js';
import { UPLOADS_DIR, UPLOADS_URL_PREFIX } from './services/uploads.js';

const app = express();

app.use(cors());
app.use(express.json());

// Seed the demo dataset on first boot only (idempotent).
if (seedDatabase(db)) {
  console.log('[db] Demo dataset seeded (1 admin, 1 client, 2 farms).');
}

// Locally stored farm banners (`C2-F1`, ADR-03).
app.use(UPLOADS_URL_PREFIX, express.static(UPLOADS_DIR, { fallthrough: true, maxAge: '1h' }));

app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok' });
});

// Authentication — register / login / current profile (`T1.3`).
app.use('/api/auth', authRouter);

// Public client browsing: approved farms only (`C1-F1`, `C1-F2`).
app.use('/api/client', clientRouter);

// In-app notifications, scoped to the connected user (`C3-F2`).
app.use('/api/notifications', notificationsRouter);

// Producer area — role isolation enforced server-side (`C2-F1` … `C2-F4`).
app.use('/api/farmer', farmerRouter);

// Administration — farm validation (`C3-F1`).
app.use('/api/admin', adminRouter);

// Demo shortcuts — **development only**. Mounted conditionally rather than
// guarded inside the route, so a production build has no route at all.
if (!IS_PRODUCTION) {
  app.use('/api/demo', demoRouter);
}

/**
 * Central error handler.
 *
 * Upload and body-parser failures must not leak stack traces, and the frontend
 * relies on a consistent `{ error, message }` shape to display a readable
 * message (see `handleResponse` in `frontend/src/api.ts`).
 */
app.use((error: unknown, _req: Request, res: Response, next: NextFunction) => {
  if (res.headersSent) {
    next(error);
    return;
  }

  if (error instanceof multer.MulterError) {
    const message =
      error.code === 'LIMIT_FILE_SIZE'
        ? 'The banner image is too large (maximum 5 MB).'
        : `Upload failed: ${error.message}`;
    res.status(400).json({ error: 'UPLOAD_ERROR', message });
    return;
  }

  if (error instanceof Error) {
    // Multer's `fileFilter` rejects with a plain Error for a wrong mime type.
    if (error.message.includes('Banner must be')) {
      res.status(400).json({ error: 'UPLOAD_ERROR', message: error.message });
      return;
    }

    // Malformed JSON bodies surface as a SyntaxError with a `body` property.
    if ('body' in error) {
      res.status(400).json({ error: 'BAD_REQUEST', message: 'Malformed JSON body.' });
      return;
    }

    console.error('[api] Unhandled error:', error);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Unexpected server error.' });
    return;
  }

  res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Unexpected server error.' });
});

app.listen(PORT, () => {
  console.log(`API PanierFermier démarrée sur http://localhost:${PORT}`);
});

export default app;
