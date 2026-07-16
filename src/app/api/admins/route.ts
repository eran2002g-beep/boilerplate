import { NextRequest, NextResponse } from "next/server";
import { createAdmin } from "@/lib/admins";
import { guardApi } from "@/lib/security";
import { validateCreateAdmin } from "@/lib/validate";

export async function POST(request: NextRequest) {
  const auth = await guardApi(request, { mutate: true });
  if ("error" in auth) return auth.error;

  if (auth.user.kind !== "admin") {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { data, error } = validateCreateAdmin(body);
  if (error || !data) {
    return NextResponse.json({ error }, { status: 400 });
  }

  try {
    const admin = await createAdmin(data);
    return NextResponse.json({ admin }, { status: 201 });
  } catch (err) {
    if (err instanceof Error && err.message === "EMAIL_EXISTS") {
      return NextResponse.json({ error: "Email already in use" }, { status: 409 });
    }
    throw err;
  }
}
