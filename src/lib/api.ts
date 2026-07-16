/**
 * Frontend API client — all browser → backend calls live here.
 * Pages should import from this file only (not call fetch/apiFetch directly).
 */
import {
  getCsrfToken,
  getToken,
  setCsrfToken,
  setSession,
  type StoredUser,
} from "@/lib/client-auth";
import type { Admin, Employee } from "@/lib/types";

// ─── Shared types ───────────────────────────────────────────────────────────

export type AuthProfile = {
  kind: "admin" | "employee";
  id: string;
  email: string;
  name: string;
  employee: Employee | null;
};

export type EmployeeFilters = {
  q?: string;
  role?: string;
  department?: string;
  name?: string;
  email?: string;
  /** 1-based page index (default 1 on the API). */
  page?: number;
  /** Rows per page (default 10, max 100 on the API). */
  limit?: number;
};

export type EmployeeListResponse = {
  employees: Employee[];
  filters: Omit<EmployeeFilters, "page" | "limit">;
  page: number;
  limit: number;
  /** Total matching rows across all pages. */
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
};

export type EmployeePayload = {
  name: string;
  email: string;
  role: string;
  department: string;
  phone?: string;
  password?: string;
};

export type LoginResult = {
  token: string;
  csrfToken: string;
  user: StoredUser;
};

export type AdminPayload = {
  name: string;
  email: string;
  password: string;
};

// ─── Low-level fetch (auth + CSRF) ──────────────────────────────────────────

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

  setCsrfToken(data.csrfToken);
  return data.csrfToken;
}

async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
  retried = false,
): Promise<T> {
  const token = getToken();
  const headers = new Headers(options.headers);
  const method = (options.method || "GET").toUpperCase();
  const isMutating =
    method !== "GET" && method !== "HEAD" && method !== "OPTIONS";

  if (token) headers.set("Authorization", `Bearer ${token}`);

  if (isMutating) {
    const csrf = (await ensureCsrfToken()) || getCsrfToken();
    if (csrf) headers.set("X-CSRF-Token", csrf);
  }

  // Never force JSON on FormData/Blob/File — the runtime must set multipart
  // boundaries (or keep the caller-supplied image Content-Type) itself.
  const body = options.body;
  const isBinaryBody =
    (typeof FormData !== "undefined" && body instanceof FormData) ||
    (typeof Blob !== "undefined" && body instanceof Blob) ||
    (typeof ArrayBuffer !== "undefined" && body instanceof ArrayBuffer) ||
    ArrayBuffer.isView(body);

  if (body && !isBinaryBody && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  // If FormData is used, drop any Content-Type so the boundary is generated.
  if (typeof FormData !== "undefined" && body instanceof FormData) {
    headers.delete("Content-Type");
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
      typeof data.error === "string"
        ? data.error
        : `Request failed (${res.status})`,
    );
  }

  return data as T;
}

function buildQuery(filters: EmployeeFilters): string {
  const params = new URLSearchParams();
  if (filters.q?.trim()) params.set("q", filters.q.trim());
  if (filters.role?.trim()) params.set("role", filters.role.trim());
  if (filters.department?.trim()) {
    params.set("department", filters.department.trim());
  }
  if (filters.name?.trim()) params.set("name", filters.name.trim());
  if (filters.email?.trim()) params.set("email", filters.email.trim());
  if (filters.page != null) params.set("page", String(filters.page));
  if (filters.limit != null) params.set("limit", String(filters.limit));
  const query = params.toString();
  return query ? `?${query}` : "";
}

// ─── Auth ───────────────────────────────────────────────────────────────────

/** POST /api/auth/login */
export async function login(
  email: string,
  password: string,
): Promise<LoginResult> {
  const res = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(
      typeof data.error === "string" ? data.error : "Login failed",
    );
  }

  const result = data as LoginResult;
  setSession(result.token, result.user, result.csrfToken);
  return result;
}

/** POST /api/auth/logout */
export async function logout(): Promise<void> {
  try {
    await fetch("/api/auth/logout", {
      method: "POST",
      credentials: "same-origin",
    });
  } catch {
    // ignore network errors on logout
  }
}

/** GET /api/auth/me */
export async function getMe(): Promise<AuthProfile> {
  const data = await apiFetch<{ profile: AuthProfile }>("/api/auth/me");
  return data.profile;
}

// ─── Admins ─────────────────────────────────────────────────────────────────

/** POST /api/admins — requires an authenticated admin. */
export async function createAdmin(payload: AdminPayload): Promise<Admin> {
  const data = await apiFetch<{ admin: Admin }>("/api/admins", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return data.admin;
}

// ─── Employees ──────────────────────────────────────────────────────────────

/** GET /api/employees — supports page & limit for pagination. */
export async function listEmployees(
  filters: EmployeeFilters = {},
): Promise<EmployeeListResponse> {
  return apiFetch(`/api/employees${buildQuery(filters)}`);
}

/** GET /api/employees/:id */
export async function getEmployee(id: string): Promise<Employee> {
  const data = await apiFetch<{ employee: Employee }>(`/api/employees/${id}`);
  return data.employee;
}

/** POST /api/employees */
export async function createEmployee(
  payload: EmployeePayload & { password: string },
): Promise<Employee> {
  const data = await apiFetch<{ employee: Employee }>("/api/employees", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return data.employee;
}

/** PUT /api/employees/:id */
export async function updateEmployee(
  id: string,
  payload: EmployeePayload,
): Promise<Employee> {
  const data = await apiFetch<{ employee: Employee }>(`/api/employees/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
  return data.employee;
}

/** PATCH /api/employees/:id */
export async function patchEmployee(
  id: string,
  payload: Partial<EmployeePayload>,
): Promise<Employee> {
  const data = await apiFetch<{ employee: Employee }>(`/api/employees/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
  return data.employee;
}

/** DELETE /api/employees/:id */
export async function deleteEmployee(id: string): Promise<void> {
  await apiFetch(`/api/employees/${id}`, { method: "DELETE" });
}

/** POST /api/employees/:id/photo — raw image body (not multipart). */
export async function uploadEmployeePhoto(
  id: string,
  file: File,
): Promise<Employee> {
  const data = await apiFetch<{ employee: Employee }>(
    `/api/employees/${id}/photo`,
    {
      method: "POST",
      headers: {
        "Content-Type": file.type || "application/octet-stream",
      },
      body: file,
    },
  );
  return data.employee;
}
