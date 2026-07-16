import { createHash } from "crypto";
import { EncryptJWT, jwtDecrypt } from "jose";
import { NextRequest } from "next/server";
import { getEmployeeByEmail } from "@/lib/employees";
import { getDb } from "@/lib/mongodb";
import { verifyPassword } from "@/lib/password";
import { ACCESS_TOKEN_TTL } from "@/lib/session-ttl";
import type { AuthUser } from "./types";

type AdminRecord = {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
};

async function getAdminByEmail(email: string): Promise<AdminRecord | null> {
  const db = await getDb();
  const doc = await db.collection<AdminRecord>("admins").findOne(
    { email: email.toLowerCase() },
    { projection: { _id: 0 } },
  );
  return doc;
}

/** 256-bit key for A256GCM (dir) — derived from JWT_SECRET. */
function getEncryptionKey() {
  const secret = process.env.JWT_SECRET || "dev-secret-change-me-in-production";
  return createHash("sha256").update(secret).digest();
}

export async function authenticate(
  email: string,
  password: string,
): Promise<AuthUser | null> {
  const normalized = email.toLowerCase();
  const admin = await getAdminByEmail(normalized);
  if (admin) {
    const ok = await verifyPassword(password, admin.passwordHash);
    if (!ok) return null;
    return {
      id: admin.id,
      email: admin.email,
      name: admin.name,
      kind: "admin",
    };
  }

  const employee = await getEmployeeByEmail(normalized);
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
  return new EncryptJWT({
    email: user.email,
    name: user.name,
    kind: user.kind,
  })
    .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(ACCESS_TOKEN_TTL)
    .encrypt(getEncryptionKey());
}

export async function verifyToken(token: string): Promise<AuthUser | null> {
  try {
    const { payload } = await jwtDecrypt(token, getEncryptionKey(), {
      contentEncryptionAlgorithms: ["A256GCM"],
      keyManagementAlgorithms: ["dir"],
    });
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
