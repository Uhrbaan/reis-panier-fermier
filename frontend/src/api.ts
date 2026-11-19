// Shared frontend types + typed API access.
//
// The farm data now comes from the Express/SQLite backend (`GET /api/client/*`)
// instead of the former hardcoded `data/farms.ts`. Field names are camelCase
// because the server maps the SQLite snake_case columns in its DTOs.

export type PaymentMethod = "CASH" | "TWINT_FARM" | "CARD_FARM";

export interface Product {
  id: number;
  farmId: number;
  name: string;
  unit: string;
  unitPrice: number;
}

export interface Farm {
  id: number;
  name: string;
  description: string;
  address: string;
  latitude: number;
  longitude: number;
  bannerUrl: string | null;
  openingHours: string;
  paymentMethods: PaymentMethod[];
  status: "PENDING_APPROVAL" | "APPROVED" | "REJECTED";
  products: Product[];
}

/** Human-readable labels for the farm-gate payment methods (`C2-F2`). */
export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  CASH: "Cash (sur place)",
  TWINT_FARM: "TWINT (sur place)",
  CARD_FARM: "Carte (sur place)",
};

export function paymentMethodLabel(method: PaymentMethod): string {
  return PAYMENT_METHOD_LABELS[method] ?? method;
}

const API_BASE = "/api";

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} on ${path}`);
  }

  return (await response.json()) as T;
}

/** Approved farms for the public map (`C1-F1`). */
export async function fetchApprovedFarms(): Promise<Farm[]> {
  const data = await getJson<{ farms: Farm[] }>("/client/farms");
  return data.farms;
}

/** Single approved storefront (`C1-F2`); throws when missing or not approved. */
export async function fetchFarmById(id: number): Promise<Farm> {
  const data = await getJson<{ farm: Farm }>(`/client/farms/${id}`);
  return data.farm;
}
