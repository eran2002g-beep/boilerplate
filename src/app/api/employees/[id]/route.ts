import { NextRequest, NextResponse } from "next/server";
import {
  deleteEmployee,
  getEmployee,
  patchEmployee,
  replaceEmployee,
} from "@/lib/employees";
import { sanitizeId } from "@/lib/sanitize";
import { guardApi } from "@/lib/security";
import { validatePatch, validateReplace } from "@/lib/validate";

type Ctx = { params: Promise<{ id: string }> };

async function parseId(context: Ctx) {
  const { id } = await context.params;
  return sanitizeId(id);
}

export async function GET(request: NextRequest, context: Ctx) {
  const auth = await guardApi(request);
  if ("error" in auth) return auth.error;

  const id = await parseId(context);
  if (!id.ok) {
    return NextResponse.json({ error: id.error }, { status: 400 });
  }

  const employee = await getEmployee(id.value);
  if (!employee) {
    return NextResponse.json({ error: "Employee not found" }, { status: 404 });
  }

  return NextResponse.json({ employee });
}

export async function PUT(request: NextRequest, context: Ctx) {
  const auth = await guardApi(request, { mutate: true });
  if ("error" in auth) return auth.error;

  const id = await parseId(context);
  if (!id.ok) {
    return NextResponse.json({ error: id.error }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { data, error } = validateReplace(body);
  if (error || !data) {
    return NextResponse.json({ error }, { status: 400 });
  }

  try {
    const employee = await replaceEmployee(id.value, data);
    if (!employee) {
      return NextResponse.json({ error: "Employee not found" }, { status: 404 });
    }
    return NextResponse.json({ employee });
  } catch (err) {
    if (err instanceof Error && err.message === "EMAIL_EXISTS") {
      return NextResponse.json({ error: "Email already in use" }, { status: 409 });
    }
    throw err;
  }
}

export async function PATCH(request: NextRequest, context: Ctx) {
  const auth = await guardApi(request, { mutate: true });
  if ("error" in auth) return auth.error;

  const id = await parseId(context);
  if (!id.ok) {
    return NextResponse.json({ error: id.error }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { data, error } = validatePatch(body);
  if (error || !data) {
    return NextResponse.json({ error }, { status: 400 });
  }

  try {
    const employee = await patchEmployee(id.value, data);
    if (!employee) {
      return NextResponse.json({ error: "Employee not found" }, { status: 404 });
    }
    return NextResponse.json({ employee });
  } catch (err) {
    if (err instanceof Error && err.message === "EMAIL_EXISTS") {
      return NextResponse.json({ error: "Email already in use" }, { status: 409 });
    }
    throw err;
  }
}

export async function DELETE(request: NextRequest, context: Ctx) {
  const auth = await guardApi(request, { mutate: true });
  if ("error" in auth) return auth.error;

  const id = await parseId(context);
  if (!id.ok) {
    return NextResponse.json({ error: id.error }, { status: 400 });
  }

  const deleted = await deleteEmployee(id.value);
  if (!deleted) {
    return NextResponse.json({ error: "Employee not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
