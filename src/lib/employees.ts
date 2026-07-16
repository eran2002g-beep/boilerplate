import { randomUUID } from "crypto";
import type { Filter } from "mongodb";
import { hashPassword } from "@/lib/password";
import { getDb } from "@/lib/mongodb";
import {
  toPublicEmployee,
  type CreateEmployeeInput,
  type Employee,
  type EmployeeRecord,
  type UpdateEmployeeInput,
} from "./types";

const COLLECTION = "employees";
const DEFAULT_SEED_PASSWORD = "password123";

let ready: Promise<void> | null = null;

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function employees() {
  const db = await getDb();
  return db.collection<EmployeeRecord>(COLLECTION);
}

async function ensureReady() {
  if (!ready) {
    ready = (async () => {
      const col = await employees();
      await col.createIndexes([
        { key: { email: 1 }, name: "uniq_email", unique: true },
        { key: { id: 1 }, name: "uniq_id", unique: true },
        { key: { role: 1 }, name: "by_role" },
        { key: { department: 1 }, name: "by_department" },
      ]);

      const count = await col.countDocuments();
      if (count === 0) {
        const passwordHash = await hashPassword(DEFAULT_SEED_PASSWORD);
        await col.insertMany([
          {
            id: "emp-001",
            name: "Ava Chen",
            email: "ava.chen@company.com",
            role: "Engineer",
            department: "Product",
            phone: "+1-555-0101",
            photoUrl: null,
            passwordHash,
            createdAt: "2026-01-10T10:00:00.000Z",
            updatedAt: "2026-01-10T10:00:00.000Z",
          },
          {
            id: "emp-002",
            name: "Jordan Blake",
            email: "jordan.blake@company.com",
            role: "Designer",
            department: "Design",
            phone: "+1-555-0102",
            photoUrl: null,
            passwordHash,
            createdAt: "2026-02-01T12:00:00.000Z",
            updatedAt: "2026-02-01T12:00:00.000Z",
          },
        ]);
      }
    })();
  }
  await ready;
}

export type EmployeeFilters = {
  q?: string;
  name?: string;
  email?: string;
  role?: string;
  department?: string;
};

export type EmployeeListOptions = {
  /** 1-based page index. */
  page?: number;
  /** Max rows to return for this page. */
  limit?: number;
};

export type EmployeeListResult = {
  employees: Employee[];
  /** Total rows matching filters (across all pages). */
  total: number;
};

function buildQuery(filters: EmployeeFilters): Filter<EmployeeRecord> {
  const and: Filter<EmployeeRecord>[] = [];

  if (filters.q) {
    const rx = new RegExp(escapeRegex(filters.q), "i");
    and.push({
      $or: [
        { name: rx },
        { email: rx },
        { role: rx },
        { department: rx },
        { phone: rx },
      ],
    });
  }
  if (filters.name) {
    and.push({ name: new RegExp(escapeRegex(filters.name), "i") });
  }
  if (filters.email) {
    and.push({ email: new RegExp(escapeRegex(filters.email), "i") });
  }
  if (filters.role) {
    and.push({ role: new RegExp(escapeRegex(filters.role), "i") });
  }
  if (filters.department) {
    and.push({ department: new RegExp(escapeRegex(filters.department), "i") });
  }

  if (and.length === 0) return {};
  if (and.length === 1) return and[0];
  return { $and: and };
}

export async function listEmployees(
  filters: EmployeeFilters = {},
  options: EmployeeListOptions = {},
): Promise<EmployeeListResult> {
  await ensureReady();
  const col = await employees();
  const query = buildQuery(filters);

  const page = Math.max(1, options.page ?? 1);
  const limit = Math.max(1, options.limit ?? 10);
  const skip = (page - 1) * limit;

  const [total, docs] = await Promise.all([
    col.countDocuments(query),
    col
      .find(query)
      .project({ _id: 0, passwordHash: 0 })
      .sort({ name: 1 })
      .skip(skip)
      .limit(limit)
      .toArray(),
  ]);

  return { employees: docs as Employee[], total };
}

export async function getEmployee(id: string): Promise<Employee | null> {
  await ensureReady();
  const col = await employees();
  const doc = await col.findOne(
    { id },
    { projection: { _id: 0, passwordHash: 0 } },
  );
  return doc as Employee | null;
}

export async function getEmployeeByEmail(
  email: string,
): Promise<EmployeeRecord | null> {
  await ensureReady();
  const col = await employees();
  const doc = await col.findOne(
    { email: email.toLowerCase() },
    { projection: { _id: 0 } },
  );
  return doc as EmployeeRecord | null;
}

export async function createEmployee(
  input: CreateEmployeeInput,
): Promise<Employee> {
  await ensureReady();
  const col = await employees();

  const existing = await col.findOne({ email: input.email.toLowerCase() });
  if (existing) throw new Error("EMAIL_EXISTS");

  const now = new Date().toISOString();
  const employee: EmployeeRecord = {
    id: `emp-${randomUUID().slice(0, 8)}`,
    name: input.name,
    email: input.email.toLowerCase(),
    role: input.role,
    department: input.department,
    phone: input.phone || undefined,
    photoUrl: null,
    passwordHash: await hashPassword(input.password),
    createdAt: now,
    updatedAt: now,
  };

  try {
    await col.insertOne(employee);
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

  return toPublicEmployee(employee);
}

export async function replaceEmployee(
  id: string,
  input: CreateEmployeeInput,
): Promise<Employee | null> {
  await ensureReady();
  const col = await employees();
  const existing = await col.findOne({ id }, { projection: { _id: 0 } });
  if (!existing) return null;

  const emailTaken = await col.findOne({
    id: { $ne: id },
    email: input.email.toLowerCase(),
  });
  if (emailTaken) throw new Error("EMAIL_EXISTS");

  const updated: EmployeeRecord = {
    ...(existing as EmployeeRecord),
    name: input.name,
    email: input.email.toLowerCase(),
    role: input.role,
    department: input.department,
    phone: input.phone || undefined,
    passwordHash: input.password
      ? await hashPassword(input.password)
      : (existing as EmployeeRecord).passwordHash,
    updatedAt: new Date().toISOString(),
  };

  try {
    await col.replaceOne({ id }, updated);
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

  return toPublicEmployee(updated);
}

export async function patchEmployee(
  id: string,
  input: UpdateEmployeeInput,
): Promise<Employee | null> {
  await ensureReady();
  const col = await employees();
  const existing = await col.findOne({ id }, { projection: { _id: 0 } });
  if (!existing) return null;

  if (input.email) {
    const emailTaken = await col.findOne({
      id: { $ne: id },
      email: input.email.toLowerCase(),
    });
    if (emailTaken) throw new Error("EMAIL_EXISTS");
  }

  const updated: EmployeeRecord = {
    ...(existing as EmployeeRecord),
    name: input.name ?? (existing as EmployeeRecord).name,
    email: input.email?.toLowerCase() ?? (existing as EmployeeRecord).email,
    role: input.role ?? (existing as EmployeeRecord).role,
    department: input.department ?? (existing as EmployeeRecord).department,
    phone:
      input.phone !== undefined
        ? input.phone || undefined
        : (existing as EmployeeRecord).phone,
    passwordHash: input.password
      ? await hashPassword(input.password)
      : (existing as EmployeeRecord).passwordHash,
    updatedAt: new Date().toISOString(),
  };

  try {
    await col.replaceOne({ id }, updated);
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

  return toPublicEmployee(updated);
}

export async function deleteEmployee(id: string): Promise<boolean> {
  await ensureReady();
  const col = await employees();
  const result = await col.deleteOne({ id });
  return result.deletedCount === 1;
}

export async function setEmployeePhoto(
  id: string,
  photoUrl: string,
): Promise<Employee | null> {
  await ensureReady();
  const col = await employees();
  const result = await col.findOneAndUpdate(
    { id },
    { $set: { photoUrl, updatedAt: new Date().toISOString() } },
    { returnDocument: "after", projection: { _id: 0 } },
  );

  if (!result) return null;
  return toPublicEmployee(result as EmployeeRecord);
}
