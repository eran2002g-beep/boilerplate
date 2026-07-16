import { NextRequest, NextResponse } from "next/server";
import { createEmployee, listEmployees } from "@/lib/employees";
import { sanitizeFilter } from "@/lib/sanitize";
import { guardApi } from "@/lib/security";
import { validateCreate } from "@/lib/validate";

export async function GET(request: NextRequest) {
  const auth = await guardApi(request);
  if ("error" in auth) return auth.error;

  const params = request.nextUrl.searchParams;

  const q = sanitizeFilter(params.get("q"), "q");
  const name = sanitizeFilter(params.get("name"), "name");
  const email = sanitizeFilter(params.get("email"), "email");
  const role = sanitizeFilter(params.get("role"), "role");
  const department = sanitizeFilter(params.get("department"), "department");

  for (const field of [q, name, email, role, department]) {
    if (!field.ok) {
      return NextResponse.json({ error: field.error }, { status: 400 });
    }
  }

  const filters = {
    q: q.ok ? q.value : undefined,
    name: name.ok ? name.value : undefined,
    email: email.ok ? email.value : undefined,
    role: role.ok ? role.value : undefined,
    department: department.ok ? department.value : undefined,
  };

  const employees = await listEmployees(filters);
  return NextResponse.json({ employees, filters, total: employees.length });
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
