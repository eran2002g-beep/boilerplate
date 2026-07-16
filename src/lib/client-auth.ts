const TOKEN_KEY = "employee_app_token";
const USER_KEY = "employee_app_user";
const CSRF_KEY = "employee_app_csrf";

export type StoredUser = {
  id: string;
  email: string;
  name: string;
  kind?: "admin" | "employee";
};

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
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

function storeCsrfToken(token: string) {
  localStorage.setItem(CSRF_KEY, token);
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

export function setSession(
  token: string,
  user: StoredUser,
  csrfToken?: string,
) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  if (csrfToken) storeCsrfToken(csrfToken);
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem(CSRF_KEY);
}

/** Fetch a fresh CSRF cookie + token when missing or after a CSRF failure. */
export async function ensureCsrfToken(force = false): Promise<string | null> {
  if (!force) {
    const existing = getCsrfToken();
    if (existing) return existing;
  }

  const token = getToken();
  if (!token) return null;

  const res = await fetch("/api/auth/csrf", {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
    credentials: "same-origin",
  });

  if (!res.ok) return null;

  const data = (await res.json()) as { csrfToken?: string };
  if (!data.csrfToken) return null;

  storeCsrfToken(data.csrfToken);
  return data.csrfToken;
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
  retried = false,
): Promise<T> {
  const token = getToken();
  const headers = new Headers(options.headers);
  const method = (options.method || "GET").toUpperCase();
  const isMutating = method !== "GET" && method !== "HEAD" && method !== "OPTIONS";

  if (token) headers.set("Authorization", `Bearer ${token}`);

  if (isMutating) {
    const csrf = (await ensureCsrfToken()) || getCsrfToken();
    if (csrf) headers.set("X-CSRF-Token", csrf);
  }

  if (
    options.body &&
    !(options.body instanceof FormData) &&
    !headers.has("Content-Type")
  ) {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(path, {
    ...options,
    headers,
    credentials: "same-origin",
  });
  const data = await res.json().catch(() => ({}));

  if (
    res.status === 403 &&
    isMutating &&
    !retried &&
    typeof data.error === "string" &&
    data.error.toLowerCase().includes("csrf")
  ) {
    await ensureCsrfToken(true);
    return apiFetch<T>(path, options, true);
  }

  if (!res.ok) {
    throw new Error(
      typeof data.error === "string" ? data.error : `Request failed (${res.status})`,
    );
  }

  return data as T;
}
