import { IS_PRODUCTION } from '../config/env.js';

/**
 * Server-side address geocoding (`C2-F1`, ADR-02).
 *
 * The producer only types a postal address: coordinates are derived here so the
 * browser never has to touch the GPS sensor (`C1-NF1`).
 *
 * Provider order:
 *  1. `api3.geo.admin.ch` — official Swiss federal service, free, no key, and
 *     authoritative for Swiss addresses (the only country we serve).
 *  2. Nominatim (OpenStreetMap) — fallback when the federal API is unreachable.
 *
 * Both are rate-limited public services, so callers should treat geocoding as a
 * slow, fallible operation and surface a clear error to the producer.
 */

export interface Coordinates {
  latitude: number;
  longitude: number;
}

/** Coordinates must land inside Switzerland; anything else means a bad match. */
const SWITZERLAND_BOUNDS = {
  minLat: 45.8,
  maxLat: 47.81,
  minLon: 5.95,
  maxLon: 10.5,
};

const GEO_ADMIN_URL = 'https://api3.geo.admin.ch/rest/services/api/SearchServer';
const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';

/** Abort a hung provider rather than blocking the request for 30 s. */
const REQUEST_TIMEOUT_MS = 5000;

function isInSwitzerland({ latitude, longitude }: Coordinates): boolean {
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= SWITZERLAND_BOUNDS.minLat &&
    latitude <= SWITZERLAND_BOUNDS.maxLat &&
    longitude >= SWITZERLAND_BOUNDS.minLon &&
    longitude <= SWITZERLAND_BOUNDS.maxLon
  );
}

interface GeoAdminResponse {
  results?: Array<{ attrs?: { lat?: number; lon?: number } }>;
}

/** Swiss federal geocoder. Returns `null` when nothing plausible matched. */
async function geocodeWithGeoAdmin(address: string): Promise<Coordinates | null> {
  const url = new URL(GEO_ADMIN_URL);
  url.searchParams.set('type', 'locations');
  url.searchParams.set('searchText', address);
  url.searchParams.set('origins', 'address');

  const response = await fetch(url, {
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`geo.admin.ch responded with HTTP ${response.status}`);
  }

  const payload = (await response.json()) as GeoAdminResponse;
  const attrs = payload.results?.[0]?.attrs;

  // The federal API returns `lat`/`lon` directly on `attrs` for address hits.
  if (typeof attrs?.lat !== 'number' || typeof attrs?.lon !== 'number') {
    return null;
  }

  const coords = { latitude: attrs.lat, longitude: attrs.lon };
  return isInSwitzerland(coords) ? coords : null;
}

interface NominatimResult {
  lat?: string;
  lon?: string;
}

/** OpenStreetMap fallback. Returns `null` when nothing plausible matched. */
async function geocodeWithNominatim(address: string): Promise<Coordinates | null> {
  const url = new URL(NOMINATIM_URL);
  url.searchParams.set('q', address);
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('limit', '1');
  url.searchParams.set('countrycodes', 'ch');

  const response = await fetch(url, {
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    headers: {
      Accept: 'application/json',
      // Nominatim's usage policy requires an identifying User-Agent.
      'User-Agent': 'PanierFermier/1.0 (REIS course project)',
    },
  });

  if (!response.ok) {
    throw new Error(`Nominatim responded with HTTP ${response.status}`);
  }

  const results = (await response.json()) as NominatimResult[];
  const first = results[0];
  if (!first?.lat || !first?.lon) {
    return null;
  }

  const coords = { latitude: Number(first.lat), longitude: Number(first.lon) };
  return isInSwitzerland(coords) ? coords : null;
}

/**
 * Resolve a Swiss postal address to coordinates.
 *
 * @throws when both providers fail or neither recognises the address — the
 * route turns this into a `422` so the producer can correct the address.
 */
export async function geocodeAddress(address: string): Promise<Coordinates> {
  const trimmed = address.trim();
  if (!trimmed) {
    throw new Error('Address is empty.');
  }

  const attempts: Array<[string, (value: string) => Promise<Coordinates | null>]> = [
    ['geo.admin.ch', geocodeWithGeoAdmin],
    ['nominatim', geocodeWithNominatim],
  ];

  for (const [provider, geocode] of attempts) {
    try {
      const coords = await geocode(trimmed);
      if (coords) {
        return coords;
      }
    } catch (error) {
      // Never let one provider's outage abort the chain: try the next one.
      if (IS_PRODUCTION) {
        console.warn(`[geocoder] ${provider} failed:`, error);
      }
    }
  }

  throw new Error('Address could not be geocoded to a Swiss location.');
}
