// Shared frontend types + typed API access.
//
// The farm data now comes from the Express/SQLite backend (`GET /api/client/*`)
// instead of the former hardcoded `data/farms.ts`. Field names are camelCase
// because the server maps the SQLite snake_case columns in its DTOs.

import { authHeaders } from "./auth";
import type { SessionUser } from "./auth";

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
  /** Raw Markdown as typed by the producer (only used to pre-fill the editor). */
  description: string;
  /**
   * Sanitised HTML rendition produced and stored server-side (`ADR-04`).
   * This is what public views render with `v-html` — never `description`.
   */
  descriptionHtml: string;
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

/** Lit une réponse JSON et lève une erreur lisible si le statut HTTP échoue. */
async function handleResponse<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const msg =
      (data && (data.error || data.message)) ||
      `Erreur HTTP ${response.status}`;
    throw new Error(msg);
  }
  return data as T;
}

/** Récupère la ferme du producteur connecté, ou `null` s'il n'en a pas encore créé (404). */
export async function fetchMyFarm(): Promise<Farm | null> {
  const response = await fetch(`${API_BASE}/farmer/farm`, {
    headers: { Accept: "application/json", ...authHeaders() },
  });

  if (response.status === 404) return null;
  const data = await handleResponse<{ farm?: Farm } & Farm>(response);
  return data.farm ?? data;
}

export interface FarmFormPayload {
  name: string;
  address: string;
  openingHours: string;
  description: string;
  paymentMethods: PaymentMethod[];
  bannerFile: File | null;
}

/** Crée (POST) ou met à jour (PUT) la vitrine producteur en multipart/form-data (`C2-F1`, `C2-F2`, `C2-F4`). */
export async function saveMyFarm(
  payload: FarmFormPayload,
  isEditing: boolean
): Promise<Farm> {
  const formData = new FormData();
  formData.append("name", payload.name.trim());
  formData.append("address", payload.address.trim());
  formData.append("openingHours", payload.openingHours.trim());
  formData.append("description", payload.description.trim());
  formData.append("paymentMethods", JSON.stringify(payload.paymentMethods));

  if (payload.bannerFile) {
    formData.append("banner", payload.bannerFile);
  }

  // Important : ne PAS mettre "Content-Type" à la main avec FormData,
  // le navigateur ajoute automatiquement "multipart/form-data; boundary=...".
  const response = await fetch(`${API_BASE}/farmer/farm`, {
    method: isEditing ? "PUT" : "POST",
    headers: { Accept: "application/json", ...authHeaders() },
    body: formData,
  });

  const data = await handleResponse<{ farm?: Farm } & Farm>(response);
  return data.farm ?? data;
}

export interface ProductInput {
  name: string;
  unit: string;
  unitPrice: number;
}

/** Ajoute un produit sans stock au catalogue (`C2-F3`). */
export async function createProduct(input: ProductInput): Promise<Product> {
  const response = await fetch(`${API_BASE}/farmer/products`, {
    method: "POST",
    headers: {
      // Spread the auth header first: it must never override Content-Type.
      ...authHeaders(),
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(input),
  });

  const data = await handleResponse<{ product?: Product } & Product>(response);
  return data.product ?? data;
}

/** Modifie un produit existant (`C2-F3`). */
export async function updateProduct(
  productId: number,
  input: ProductInput
): Promise<Product> {
  const response = await fetch(`${API_BASE}/farmer/products/${productId}`, {
    method: "PUT",
    headers: {
      // Spread the auth header first: it must never override Content-Type.
      ...authHeaders(),
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(input),
  });

  const data = await handleResponse<{ product?: Product } & Product>(response);
  return data.product ?? data;
}

/** Supprime un produit du catalogue (`C2-F3`). */
export async function deleteProduct(productId: number): Promise<void> {
  const response = await fetch(`${API_BASE}/farmer/products/${productId}`, {
    method: "DELETE",
    headers: { Accept: "application/json", ...authHeaders() },
  });

  if (!response.ok) {
    await handleResponse(response);
  }
}

// ---------------------------------------------------------------------------
// Authentification (`T1.3`)
// ---------------------------------------------------------------------------

export interface AuthResponse {
  token: string;
  user: SessionUser;
}

/** Connexion ; renvoie le jeton et le profil (`POST /api/auth/login`). */
export async function login(email: string, password: string): Promise<AuthResponse> {
  const response = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ email, password }),
  });

  return handleResponse<AuthResponse>(response);
}

export interface RegisterInput {
  name: string;
  email: string;
  password: string;
  role: "CLIENT" | "FARMER";
}

/** Inscription ; ouvre directement une session (`POST /api/auth/register`). */
export async function register(input: RegisterInput): Promise<AuthResponse> {
  const response = await fetch(`${API_BASE}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(input),
  });

  return handleResponse<AuthResponse>(response);
}

/** Profil de l'utilisateur connecté (`GET /api/auth/me`). */
export async function fetchMe(): Promise<SessionUser> {
  const response = await fetch(`${API_BASE}/auth/me`, {
    headers: { Accept: "application/json", ...authHeaders() },
  });

  const data = await handleResponse<{ user: SessionUser }>(response);
  return data.user;
}

// ---------------------------------------------------------------------------
// Administration (`C3-F1`)
// ---------------------------------------------------------------------------

/** Fermes en attente de validation, de la plus ancienne à la plus récente. */
export async function fetchPendingFarms(): Promise<Farm[]> {
  const response = await fetch(`${API_BASE}/admin/farms/pending`, {
    headers: { Accept: "application/json", ...authHeaders() },
  });

  const data = await handleResponse<{ farms: Farm[] }>(response);
  return data.farms;
}

/** Approuve (`APPROVED`) ou rejette (`REJECTED`) une ferme (`C3-F1`). */
export async function setFarmStatus(
  farmId: number,
  status: "APPROVED" | "REJECTED"
): Promise<void> {
  const response = await fetch(`${API_BASE}/admin/farms/${farmId}/status`, {
    method: "PATCH",
    headers: {
      ...authHeaders(),
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ status }),
  });

  await handleResponse(response);
}
