import { randomUUID } from "crypto";
import { getEmployeeByEmail } from "@/lib/employees";
import { hashPassword } from "@/lib/password";
import { getDb } from "@/lib/mongodb";
import {
  toPublicAdmin,
  type Admin,
  type AdminRecord,
  type CreateAdminInput,
} from "./types";

const COLLECTION = "admins";

let ready: Promise<void> | null = null;

async function admins() {
  const db = await getDb();
  return db.collection<AdminRecord>(COLLECTION);
}

async function ensureReady() {
  if (!ready) {
    ready = (async () => {
      const col = await admins();
      await col.createIndexes([
        { key: { email: 1 }, name: "uniq_email", unique: true },
        { key: { id: 1 }, name: "uniq_id", unique: true },
      ]);
    })();
  }
  await ready;
}

export async function createAdmin(input: CreateAdminInput): Promise<Admin> {
  await ensureReady();
  const col = await admins();
  const email = input.email.toLowerCase();

  const existingAdmin = await col.findOne({ email });
  if (existingAdmin) throw new Error("EMAIL_EXISTS");

  const existingEmployee = await getEmployeeByEmail(email);
  if (existingEmployee) throw new Error("EMAIL_EXISTS");

  const now = new Date().toISOString();
  const admin: AdminRecord = {
    id: `admin-${randomUUID().slice(0, 8)}`,
    name: input.name,
    email,
    passwordHash: await hashPassword(input.password),
    createdAt: now,
    updatedAt: now,
  };

  try {
    await col.insertOne(admin);
  } catch (err) {
    if (
      err &&
      typeof err === "object" &&
      "code" in err &&
      (err as { code?: number }).code === 11000
    ) {
      throw new Error("EMAIL_EXISTS");
    }
    throw err;
  }

  return toPublicAdmin(admin);
}
