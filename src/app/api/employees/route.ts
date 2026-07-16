import { NextRequest, NextResponse } from "next/server";
import { createEmployee, listEmployees } from "@/lib/employees";
import { sanitizeFilter } from "@/lib/sanitize";
import { guardApi } from "@/lib/security";
import { validateCreate } from "@/lib/validate";

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100;

/**
 * Parse a positive integer query param.
 * Returns null when the value is missing (caller applies default).
 * Returns an error string when the value is present but invalid.
 */
function parsePositiveInt(
  raw: string | null,
  field: string,
  max?: number,
): { ok: true; value: number | null } | { ok: false; error: string } {
  if (raw == null || raw.trim() === "") return { ok: true, value: null };
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) {
    return { ok: false, error: `${field} must be a positive integer` };
  }
  if (max != null && n > max) {
    return { ok: false, error: `${field} must be at most ${max}` };
  }
  return { ok: true, value: n };
}

export async function GET(request: NextRequest) {
  const auth = await guardApi(request);
  if ("error" in auth) return auth.error;

  const params = request.nextUrl.searchParams;

  const q = sanitizeFilter(params.get("q"), "q");
  const name = sanitizeFilter(params.get("name"), "name");
  const email = sanitizeFilter(params.get("email"), "email");
  const role = sanitizeFilter(params.get("role"), "role");
  const department = sanitizeFilter(params.get("department"), "department");

  // Pagination query params (optional — defaults applied below):
  //   page  — 1-based page index. Example: page=2
  //   limit — page size (rows per request). Example: limit=10  (max 100)
  const pageParam = parsePositiveInt(params.get("page"), "page");
  const limitParam = parsePositiveInt(params.get("limit"), "limit", MAX_LIMIT);

  for (const field of [q, name, email, role, department]) {
    if (!field.ok) {
      return NextResponse.json({ error: field.error }, { status: 400 });
    }
  }
  if (!pageParam.ok) {
    return NextResponse.json({ error: pageParam.error }, { status: 400 });
  }
  if (!limitParam.ok) {
    return NextResponse.json({ error: limitParam.error }, { status: 400 });
  }

  const filters = {
    q: q.ok ? q.value : undefined,
    name: name.ok ? name.value : undefined,
    email: email.ok ? email.value : undefined,
    role: role.ok ? role.value : undefined,
    department: department.ok ? department.value : undefined,
  };

  const page = pageParam.value ?? DEFAULT_PAGE;
  const limit = limitParam.value ?? DEFAULT_LIMIT;

  const { employees, total } = await listEmployees(filters, { page, limit });

  // Derived pagination fields for the front-end:
  //   total       — total matching rows across ALL pages (not just this page)
  //   totalPages  — how many pages exist at the current limit
  //   hasNext     — true when a "Next" button should be enabled
  //   hasPrev     — true when a "Previous" button should be enabled
  //
  // Front-end usage:
  //   1. Keep page + limit in state (and filters).
  //   2. Fetch: GET /api/employees?page=${page}&limit=${limit}&q=...
  //   3. Render `employees` for the current page.
  //   4. Show range: `Showing ${(page-1)*limit+1}–${(page-1)*limit+employees.length} of ${total}`
  //   5. Prev → setPage(page - 1) when hasPrev; Next → setPage(page + 1) when hasNext.
  //   6. Reset page to 1 whenever filters or limit change.
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const hasNext = page < totalPages;
  const hasPrev = page > 1;

  return NextResponse.json({
    employees,
    filters,
    page,
    limit,
    total,
    totalPages,
    hasNext,
    hasPrev,
  });
}

export async function POST(request: NextRequest) {
  const auth = await guardApi(request, { mutate: true });
  if ("error" in auth) return auth.error;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { data, error } = validateCreate(body);
  if (error || !data) {
    return NextResponse.json({ error }, { status: 400 });
  }

  try {
    const employee = await createEmployee(data);
    return NextResponse.json({ employee }, { status: 201 });
  } catch (err) {
    if (err instanceof Error && err.message === "EMAIL_EXISTS") {
      return NextResponse.json({ error: "Email already in use" }, { status: 409 });
    }
    throw err;
  }
}
