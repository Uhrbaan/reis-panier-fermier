// Minimal auth store for T1.2 verification.
//
// The token is kept in localStorage so it survives a page reload. This is a
// convenience for manual testing only — the real authority is the Express
// `requireAuth` / `requireRole` middleware, never a Vue Router guard.

const TOKEN_KEY = "panierfermier.token";
const USER_KEY = "panierfermier.user";

export interface SessionUser {
  id: number;
  name: string;
  email: string;
  role: "CLIENT" | "FARMER" | "ADMIN";
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function getUser(): SessionUser | null {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SessionUser;
  } catch {
    return null;
  }
}

export function setSession(token: string, user: SessionUser): void {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearSession(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

/** Attach the JWT to a request when a session exists. */
export function authHeaders(): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export interface ApiResult<T> {
  ok: boolean;
  status: number;
  body: T | null;
}

/**
 * Call a protected endpoint and report the status code so the UI can show the
 * difference between 401 (no/invalid token) and 403 (wrong role).
 */
export async function callProtected<T>(path: string): Promise<ApiResult<T>> {
  const response = await fetch(path, {
    headers: { Accept: "application/json", ...authHeaders() },
  });

  let body: T | null = null;
  try {
    body = (await response.json()) as T;
  } catch {
    body = null;
  }

  return { ok: response.ok, status: response.status, body };
}
