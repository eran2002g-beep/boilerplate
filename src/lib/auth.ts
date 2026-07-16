import { SignJWT, jwtVerify } from "jose";
import { NextRequest } from "next/server";
import { getEmployeeByEmail } from "@/lib/employees";
import { hashPassword, verifyPassword } from "@/lib/password";
import type { AuthUser } from "./types";

type AdminUser = {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
};

let adminUser: AdminUser | null = null;

async function getAdmin(): Promise<AdminUser> {
  if (!adminUser) {
    adminUser = {
      id: "admin-1",
      email: "admin@company.com",
      name: "Admin User",
      passwordHash: await hashPassword("admin123"),
    };
  }
  return adminUser;
}

function getSecret() {
  const secret = process.env.JWT_SECRET || "dev-secret-change-me-in-production";
  return new TextEncoder().encode(secret);
}

export async function authenticate(
  email: string,
  password: string,
): Promise<AuthUser | null> {
  const admin = await getAdmin();
  if (email === admin.email) {
    const ok = await verifyPassword(password, admin.passwordHash);
    if (!ok) return null;
    return {
      id: admin.id,
      email: admin.email,
      name: admin.name,
      kind: "admin",
    };
  }

  const employee = await getEmployeeByEmail(email);
  if (!employee) return null;

  const ok = await verifyPassword(password, employee.passwordHash);
  if (!ok) return null;

  return {
    id: employee.id,
    email: employee.email,
    name: employee.name,
    kind: "employee",
  };
}

export async function signToken(user: AuthUser): Promise<string> {
  return new SignJWT({
    email: user.email,
    name: user.name,
    kind: user.kind,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime("8h")
    .sign(getSecret());
}

export async function verifyToken(token: string): Promise<AuthUser | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    if (!payload.sub || typeof payload.email !== "string") return null;
    const kind = payload.kind === "employee" ? "employee" : "admin";
    return {
      id: payload.sub,
      email: payload.email,
      name: typeof payload.name === "string" ? payload.name : "",
      kind,
    };
  } catch {
    return null;
  }
}

export async function requireAuth(
  request: NextRequest,
): Promise<{ user: AuthUser } | { error: Response }> {
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) {
    return {
      error: Response.json(
        { error: "Missing or invalid Authorization header" },
        { status: 401 },
      ),
    };
  }

  const user = await verifyToken(header.slice(7));
  if (!user) {
    return {
      error: Response.json({ error: "Invalid or expired token" }, { status: 401 }),
    };
  }

  return { user };
}
