import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';

import { BACKEND_ROOT } from '../config/env.js';

/**
 * Local banner uploads (`C2-F1`, ADR-03).
 *
 * Images are written to `backend/uploads/` and served statically at
 * `/uploads/<filename>`; only the relative URL is stored in SQLite. No cloud
 * storage and no second database, per the project constraints.
 */

export const UPLOADS_DIR = path.join(BACKEND_ROOT, 'uploads');

/** URL prefix the static middleware is mounted on. */
export const UPLOADS_URL_PREFIX = '/uploads';

const MAX_BANNER_BYTES = 5 * 1024 * 1024;

/**
 * Only raster images are accepted. SVG is deliberately excluded: it can carry
 * script and would become an XSS vector once served from our own origin.
 */
const ALLOWED_MIME_TYPES = new Map<string, string>([
  ['image/jpeg', '.jpg'],
  ['image/png', '.png'],
  ['image/webp', '.webp'],
  ['image/gif', '.gif'],
]);

function ensureUploadsDir(): void {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, callback) => {
    ensureUploadsDir();
    callback(null, UPLOADS_DIR);
  },
  filename: (_req, file, callback) => {
    // Never reuse the client-supplied name: it can contain path separators or
    // an executable extension. A random name plus a mime-derived extension
    // makes the stored file inert and unguessable.
    const extension = ALLOWED_MIME_TYPES.get(file.mimetype) ?? '.bin';
    callback(null, `${Date.now()}-${crypto.randomUUID()}${extension}`);
  },
});

/**
 * Single-file upload middleware for the `banner` field.
 *
 * The file is optional: `PUT /api/farmer/farm` may update text fields without
 * replacing the image.
 */
export const uploadBanner = multer({
  storage,
  limits: { fileSize: MAX_BANNER_BYTES, files: 1 },
  fileFilter: (_req, file, callback) => {
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      callback(new Error('Banner must be a JPEG, PNG, WebP or GIF image.'));
      return;
    }
    callback(null, true);
  },
}).single('banner');

/** Turn a stored filename into the public URL kept in `farms.banner_url`. */
export function bannerUrlFor(filename: string): string {
  return `${UPLOADS_URL_PREFIX}/${filename}`;
}

/**
 * Best-effort removal of a replaced banner, so the uploads directory does not
 * grow forever. Failures are ignored: an orphaned file is harmless.
 */
export function removeBannerFile(bannerUrl: string | null): void {
  if (!bannerUrl || !bannerUrl.startsWith(`${UPLOADS_URL_PREFIX}/`)) {
    return;
  }

  const filename = path.basename(bannerUrl);
  const target = path.join(UPLOADS_DIR, filename);

  // Defence in depth: refuse anything that escapes the uploads directory.
  if (!target.startsWith(UPLOADS_DIR)) {
    return;
  }

  fs.promises.unlink(target).catch(() => {
    /* already gone, or never existed */
  });
}
