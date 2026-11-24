import { Router, type Request, type Response } from 'express';

import { db } from '../db.js';
import { asyncHandler, requireAuth, requireRole } from '../middleware/auth.js';
import {
  createFarm,
  findBannerUrlByOwnerId,
  findFarmByOwnerId,
  updateFarm,
  type FarmWriteInput,
} from '../repositories/farms.js';
import {
  createProduct,
  deleteProduct,
  findOwnedProduct,
  toProductDto,
  updateProduct,
} from '../repositories/products.js';
import { geocodeAddress } from '../services/geocoder.js';
import { bannerUrlFor, removeBannerFile, uploadBanner } from '../services/uploads.js';
import {
  LIMITS,
  parseId,
  parsePaymentMethods,
  parseUnitPrice,
  requiredMultiline,
  requiredText,
  type ValidationResult,
} from '../services/validation.js';

/**
 * Producer area (`C2-F1` … `C2-F4`).
 *
 * Every route is mounted behind `requireAuth` + `requireRole('FARMER')` and is
 * additionally scoped by `owner_id = req.user.id` at the SQL level, so a
 * producer can only ever read or mutate their own storefront. The Vue Router
 * guard is a UX nicety, never the security boundary.
 */
export const farmerRouter = Router();

farmerRouter.use(requireAuth, requireRole('FARMER'));

function badRequest(res: Response, message: string): void {
  res.status(400).json({ error: 'BAD_REQUEST', message });
}

function notFound(res: Response, message: string): void {
  res.status(404).json({ error: 'NOT_FOUND', message });
}

/** Unwrap a validation result, answering `400` on failure. */
function takeOr400<T>(res: Response, result: ValidationResult<T>): T | undefined {
  if (!result.ok) {
    badRequest(res, result.message);
    return undefined;
  }
  return result.value;
}

/**
 * The producer's storefront (`C2-F1`).
 * Answers `404` when the producer has not created one yet — the frontend treats
 * that as "show the creation form".
 */
farmerRouter.get('/farm', (req: Request, res: Response) => {
  const farm = findFarmByOwnerId(db, req.user!.id);

  if (!farm) {
    notFound(res, 'You have not created a storefront yet.');
    return;
  }

  res.json({ farm });
});

interface FarmPayload {
  name: string;
  address: string;
  openingHours: string;
  description: string;
  paymentMethods: FarmWriteInput['paymentMethods'];
}

/**
 * Validate the text fields shared by `POST` and `PUT`.
 * `multipart/form-data` delivers everything as strings, so each field is
 * validated from `unknown` rather than trusting the body type.
 */
function parseFarmPayload(body: Record<string, unknown>): ValidationResult<FarmPayload> {
  const name = requiredText(body.name, 'name', LIMITS.name);
  if (!name.ok) return name;

  const address = requiredText(body.address, 'address', LIMITS.address);
  if (!address.ok) return address;

  const openingHours = requiredMultiline(body.openingHours, 'openingHours', LIMITS.openingHours);
  if (!openingHours.ok) return openingHours;

  const description = requiredMultiline(
    body.description,
    'description',
    LIMITS.description,
  );
  if (!description.ok) return description;

  const paymentMethods = parsePaymentMethods(body.paymentMethods);
  if (!paymentMethods.ok) return paymentMethods;

  return {
    ok: true,
    value: {
      name: name.value,
      address: address.value,
      openingHours: openingHours.value,
      description: description.value,
      paymentMethods: paymentMethods.value,
    },
  };
}

/**
 * Create the producer's storefront (`C2-F1`, `C2-F2`).
 *
 * The address is geocoded server-side (`ADR-02`) so the browser never touches
 * the GPS sensor (`C1-NF1`), and the farm starts `PENDING_APPROVAL` so it stays
 * hidden from the map until an admin validates it (`C3-F1`).
 */
farmerRouter.post(
  '/farm',
  uploadBanner,
  asyncHandler(async (req: Request, res: Response) => {
    const ownerId = req.user!.id;

    // A producer owns exactly one storefront (see `specs/design.md` §3).
    if (findFarmByOwnerId(db, ownerId)) {
      removeBannerFile(req.file ? bannerUrlFor(req.file.filename) : null);
      res.status(409).json({
        error: 'CONFLICT',
        message: 'A storefront already exists. Use PUT to update it.',
      });
      return;
    }

    const payload = parseFarmPayload(req.body as Record<string, unknown>);
    if (!payload.ok) {
      removeBannerFile(req.file ? bannerUrlFor(req.file.filename) : null);
      badRequest(res, payload.message);
      return;
    }

    // `C2-F1` requires a banner photo on creation.
    if (!req.file) {
      badRequest(res, 'A banner image is required when creating a storefront.');
      return;
    }

    let coordinates;
    try {
      coordinates = await geocodeAddress(payload.value.address);
    } catch {
      // The uploaded file is useless if we never create the farm: clean it up.
      removeBannerFile(bannerUrlFor(req.file.filename));
      res.status(422).json({
        error: 'GEOCODING_FAILED',
        message:
          'The address could not be located in Switzerland. Please check the street, postal code and city.',
      });
      return;
    }

    const farmId = createFarm(db, ownerId, {
      ...payload.value,
      latitude: coordinates.latitude,
      longitude: coordinates.longitude,
      bannerUrl: bannerUrlFor(req.file.filename),
    });

    const farm = findFarmByOwnerId(db, ownerId);
    res.status(201).json({ farm, farmId });
  }),
);

/**
 * Update the producer's storefront (`C2-F4`).
 *
 * An `APPROVED` farm stays `APPROVED` (edits go live immediately), while a
 * `REJECTED` one returns to `PENDING_APPROVAL` so a corrected storefront goes
 * back into the admin queue.
 */
farmerRouter.put(
  '/farm',
  uploadBanner,
  asyncHandler(async (req: Request, res: Response) => {
    const ownerId = req.user!.id;

    const existingBanner = findBannerUrlByOwnerId(db, ownerId);
    if (existingBanner === undefined) {
      removeBannerFile(req.file ? bannerUrlFor(req.file.filename) : null);
      notFound(res, 'You have not created a storefront yet.');
      return;
    }

    const payload = parseFarmPayload(req.body as Record<string, unknown>);
    if (!payload.ok) {
      removeBannerFile(req.file ? bannerUrlFor(req.file.filename) : null);
      badRequest(res, payload.message);
      return;
    }

    // Re-geocode only when the address actually changed: geocoding is a slow,
    // rate-limited external call and most edits touch text or the banner.
    let coordinates;
    const currentFarm = findFarmByOwnerId(db, ownerId);
    if (currentFarm && currentFarm.address === payload.value.address) {
      coordinates = {
        latitude: currentFarm.latitude,
        longitude: currentFarm.longitude,
      };
    } else {
      try {
        coordinates = await geocodeAddress(payload.value.address);
      } catch {
        removeBannerFile(req.file ? bannerUrlFor(req.file.filename) : null);
        res.status(422).json({
          error: 'GEOCODING_FAILED',
          message:
            'The address could not be located in Switzerland. Please check the street, postal code and city.',
        });
        return;
      }
    }

    const newBannerUrl = req.file ? bannerUrlFor(req.file.filename) : existingBanner;

    const updated = updateFarm(db, ownerId, {
      ...payload.value,
      latitude: coordinates.latitude,
      longitude: coordinates.longitude,
      bannerUrl: newBannerUrl,
    });

    if (!updated) {
      removeBannerFile(req.file ? bannerUrlFor(req.file.filename) : null);
      notFound(res, 'You have not created a storefront yet.');
      return;
    }

    // Only drop the old file once the new path is safely persisted.
    if (req.file) {
      removeBannerFile(existingBanner);
    }

    res.json({ farm: findFarmByOwnerId(db, ownerId) });
  }),
);

// ---------------------------------------------------------------------------
// Product catalogue (`C2-F3`) — never any stock/quantity field.
// ---------------------------------------------------------------------------

interface ProductPayload {
  name: string;
  unit: string;
  unitPrice: number;
}

function parseProductPayload(body: Record<string, unknown>): ValidationResult<ProductPayload> {
  const name = requiredText(body.name, 'name', LIMITS.productName);
  if (!name.ok) return name;

  const unit = requiredText(body.unit, 'unit', LIMITS.productUnit);
  if (!unit.ok) return unit;

  const unitPrice = parseUnitPrice(body.unitPrice);
  if (!unitPrice.ok) return unitPrice;

  return {
    ok: true,
    value: { name: name.value, unit: unit.value, unitPrice: unitPrice.value },
  };
}

farmerRouter.post('/products', (req: Request, res: Response) => {
  const payload = parseProductPayload(req.body as Record<string, unknown>);
  if (!payload.ok) {
    badRequest(res, payload.message);
    return;
  }

  const productId = createProduct(db, req.user!.id, payload.value);
  if (productId === undefined) {
    // The catalogue hangs off the storefront, so it cannot exist before it.
    res.status(409).json({
      error: 'CONFLICT',
      message: 'Create your storefront before adding products.',
    });
    return;
  }

  const product = findOwnedProduct(db, req.user!.id, productId);
  res.status(201).json({ product: product ? toProductDto(product) : undefined });
});

farmerRouter.put('/products/:id', (req: Request, res: Response) => {
  const productId = parseId(req.params.id);
  if (productId === undefined) {
    badRequest(res, 'Invalid product id.');
    return;
  }

  const payload = parseProductPayload(req.body as Record<string, unknown>);
  if (!payload.ok) {
    badRequest(res, payload.message);
    return;
  }

  // The update is owner-scoped, so a foreign id simply matches no row.
  const updated = updateProduct(db, req.user!.id, productId, payload.value);
  if (!updated) {
    notFound(res, 'Product not found.');
    return;
  }

  const product = findOwnedProduct(db, req.user!.id, productId);
  res.json({ product: product ? toProductDto(product) : undefined });
});

farmerRouter.delete('/products/:id', (req: Request, res: Response) => {
  const productId = parseId(req.params.id);
  if (productId === undefined) {
    badRequest(res, 'Invalid product id.');
    return;
  }

  const deleted = deleteProduct(db, req.user!.id, productId);
  if (!deleted) {
    notFound(res, 'Product not found.');
    return;
  }

  res.status(204).end();
});
