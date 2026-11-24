// Authentication store (`T1.3`).
//
// The token is kept in localStorage so it survives a page reload. This is a
// convenience only — the real authority is the Express `requireAuth` /
// `requireRole` middleware, never a Vue Router guard.
//
// The reactive state below is what the UI binds to (navbar, login modal). The
// `getToken()` / `getUser()` helpers remain the source of truth for request
// headers, so `api.ts` keeps working unchanged.

import { computed, reactive } from "vue";

const TOKEN_KEY = "panierfermier.token";
const USER_KEY = "panierfermier.user";

export interface SessionUser {
  id: number;
  name: string;
  email: string;
  role: "CLIENT" | "FARMER" | "ADMIN";
}

export interface AuthState {
  token: string | null;
  user: SessionUser | null;
  /** True while a login/register request is in flight. */
  pending: boolean;
  /** Last human-readable auth error, cleared on the next attempt. */
  error: string | null;
}

/** Reactive view of the session, hydrated from localStorage at startup. */
export const authState = reactive<AuthState>({
  token: getToken(),
  user: getUser(),
  pending: false,
  error: null,
});

export const isAuthenticated = computed(() => authState.token !== null);
export const currentUser = computed(() => authState.user);
export const currentRole = computed(() => authState.user?.role ?? null);

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
  authState.token = token;
  authState.user = user;
}

export function clearSession(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  authState.token = null;
  authState.user = null;
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
