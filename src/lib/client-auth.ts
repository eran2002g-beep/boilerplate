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
) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  if (csrfToken) setCsrfToken(csrfToken);
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem(CSRF_KEY);
}
