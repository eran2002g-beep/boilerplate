import {
  ACCESS_REFRESH_SKEW_MS,
  ACCESS_TOKEN_TTL_MS,
} from "@/lib/session-ttl";

const TOKEN_KEY = "employee_app_token";
const USER_KEY = "employee_app_user";
const CSRF_KEY = "employee_app_csrf";
const EXPIRES_KEY = "employee_app_expires_at";

export type StoredUser = {
  id: string;
  email: string;
  name: string;
  kind?: "admin" | "employee";
};

let expiryTimer: ReturnType<typeof setTimeout> | null = null;
let loggingOut = false;
let refreshPromise: Promise<boolean> | null = null;

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function getTokenExpiresAt(): number | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(EXPIRES_KEY);
  if (!raw) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

export function isSessionExpired(): boolean {
  const expiresAt = getTokenExpiresAt();
  if (expiresAt == null) return false;
  return Date.now() >= expiresAt;
}

/** True when access token is expired or within the refresh skew window. */
export function shouldRefreshAccessToken(): boolean {
  const expiresAt = getTokenExpiresAt();
  if (expiresAt == null) return false;
  return Date.now() >= expiresAt - ACCESS_REFRESH_SKEW_MS;
}

export function getCsrfToken(): string | null {
  if (typeof window === "undefined") return null;
  const fromStorage = localStorage.getItem(CSRF_KEY);
  if (fromStorage) return fromStorage;

  const match = document.cookie
    .split("; ")
    .find((row) => row.startsWith("csrf_token="));
  return match ? decodeURIComponent(match.split("=").slice(1).join("=")) : null;
}

export function getStoredUser(): StoredUser | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredUser;
  } catch {
    return null;
  }
}

export function setCsrfToken(token: string) {
  localStorage.setItem(CSRF_KEY, token);
}

export function setSession(
  token: string,
  user: StoredUser,
  csrfToken?: string,
  expiresInSec?: number,
) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  const ttlMs =
    expiresInSec != null && expiresInSec > 0
      ? expiresInSec * 1000
      : ACCESS_TOKEN_TTL_MS;
  localStorage.setItem(EXPIRES_KEY, String(Date.now() + ttlMs));
  if (csrfToken) setCsrfToken(csrfToken);
  scheduleAccessTokenRefresh();
}

/** Update access token after a successful refresh (keeps stored user). */
export function setAccessToken(
  token: string,
  csrfToken?: string,
  expiresInSec?: number,
  user?: StoredUser,
) {
  localStorage.setItem(TOKEN_KEY, token);
  const ttlMs =
    expiresInSec != null && expiresInSec > 0
      ? expiresInSec * 1000
      : ACCESS_TOKEN_TTL_MS;
  localStorage.setItem(EXPIRES_KEY, String(Date.now() + ttlMs));
  if (csrfToken) setCsrfToken(csrfToken);
  if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
  scheduleAccessTokenRefresh();
}

function clearExpiryTimer() {
  if (expiryTimer != null) {
    clearTimeout(expiryTimer);
    expiryTimer = null;
  }
}

export function clearSession() {
  clearExpiryTimer();
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem(CSRF_KEY);
  localStorage.removeItem(EXPIRES_KEY);
}

/** Clear local session, revoke refresh cookie, redirect to login. */
export function forceLogout() {
  if (typeof window === "undefined") return;
  if (loggingOut) return;
  loggingOut = true;

  clearSession();

  void fetch("/api/auth/logout", {
    method: "POST",
    credentials: "same-origin",
    keepalive: true,
  }).catch(() => {});

  const onLogin = window.location.pathname.startsWith("/login");
  if (!onLogin) {
    window.location.replace("/login");
  } else {
    loggingOut = false;
  }
}

/**
 * Deduped access-token refresh using the httpOnly refresh cookie.
 * Returns false if refresh fails (caller should logout).
 */
export async function refreshAccessToken(): Promise<boolean> {
  if (typeof window === "undefined") return false;

  if (!refreshPromise) {
    refreshPromise = (async () => {
      try {
        const res = await fetch("/api/auth/refresh", {
          method: "POST",
          credentials: "same-origin",
        });
        if (!res.ok) return false;

        const data = (await res.json()) as {
          token?: string;
          csrfToken?: string;
          expiresIn?: number;
          user?: StoredUser;
        };
        if (!data.token) return false;

        setAccessToken(data.token, data.csrfToken, data.expiresIn, data.user);
        return true;
      } catch {
        return false;
      }
    })().finally(() => {
      refreshPromise = null;
    });
  }

  return refreshPromise;
}

/**
 * Schedule a silent refresh shortly before the access token expires.
 * Falls back to logout only if refresh fails.
 */
export function scheduleAccessTokenRefresh() {
  if (typeof window === "undefined") return;

  clearExpiryTimer();

  if (!getToken()) return;

  const expiresAt = getTokenExpiresAt();
  if (expiresAt == null) return;

  const refreshAt = expiresAt - ACCESS_REFRESH_SKEW_MS;
  const delay = Math.max(0, refreshAt - Date.now());

  expiryTimer = setTimeout(() => {
    void (async () => {
      const ok = await refreshAccessToken();
      if (!ok) {
        forceLogout();
        return;
      }
      scheduleAccessTokenRefresh();
    })();
  }, delay);
}

/** @deprecated Use scheduleAccessTokenRefresh */
export const scheduleSessionExpiryLogout = scheduleAccessTokenRefresh;

export function startSessionWatcher() {
  if (typeof window === "undefined") return () => {};

  scheduleAccessTokenRefresh();

  const onVisibility = () => {
    if (document.visibilityState !== "visible") return;
    if (shouldRefreshAccessToken()) {
      void (async () => {
        const ok = await refreshAccessToken();
        if (!ok) forceLogout();
        else scheduleAccessTokenRefresh();
      })();
    } else {
      scheduleAccessTokenRefresh();
    }
  };

  document.addEventListener("visibilitychange", onVisibility);
  return () => {
    document.removeEventListener("visibilitychange", onVisibility);
    clearExpiryTimer();
  };
}
