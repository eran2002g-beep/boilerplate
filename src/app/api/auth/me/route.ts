import { NextRequest, NextResponse } from "next/server";
import { getEmployee, getEmployeeByEmail } from "@/lib/employees";
import { guardApi } from "@/lib/security";
import { toPublicEmployee } from "@/lib/types";

/**
 * GET /api/auth/me — profile of the logged-in user.
 * Employees get their full employee record; admins get account metadata.
 */
export async function GET(request: NextRequest) {
  const auth = await guardApi(request);
  if ("error" in auth) return auth.error;

  const { user } = auth;

  if (user.kind === "employee") {
    const byId = await getEmployee(user.id);
    const record = byId
      ? null
      : await getEmployeeByEmail(user.email);
    const employee = byId ?? (record ? toPublicEmployee(record) : null);

    if (!employee) {
      return NextResponse.json(
        { error: "Employee profile not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({
      profile: {
        kind: "employee" as const,
        id: user.id,
        email: user.email,
        name: user.name,
        employee,
      },
    });
  }

  return NextResponse.json({
    profile: {
      kind: "admin" as const,
      id: user.id,
      email: user.email,
      name: user.name,
      employee: null,
    },
  });
}
