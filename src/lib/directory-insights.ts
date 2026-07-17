/**
 * Read-only aggregates + lookups used by the in-app chatbot to answer
 * live questions about the employee directory (counts, breakdowns, search).
 * Everything here uses MongoDB driver queries with escaped regex input.
 */
import type { Filter } from "mongodb";
import { getDb } from "@/lib/mongodb";
import type { Employee, EmployeeRecord } from "@/lib/types";

const COLLECTION = "employees";

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function employees() {
  const db = await getDb();
  return db.collection<EmployeeRecord>(COLLECTION);
}

export type GroupCount = { value: string; count: number };

export type DirectorySnapshot = {
  total: number;
  departments: GroupCount[];
  roles: GroupCount[];
};

async function groupCounts(field: "department" | "role"): Promise<GroupCount[]> {
  const col = await employees();
  const rows = await col
    .aggregate<{ _id: string | null; count: number }>([
      { $group: { _id: `$${field}`, count: { $sum: 1 } } },
      { $sort: { count: -1, _id: 1 } },
    ])
    .toArray();

  return rows
    .filter((r) => typeof r._id === "string" && r._id.trim() !== "")
    .map((r) => ({ value: r._id as string, count: r.count }));
}

/** Totals plus per-department and per-role breakdowns. */
export async function getDirectorySnapshot(): Promise<DirectorySnapshot> {
  const col = await employees();
  const [total, departments, roles] = await Promise.all([
    col.countDocuments({}),
    groupCounts("department"),
    groupCounts("role"),
  ]);
  return { total, departments, roles };
}

/** Count rows for a single-field case-insensitive exact-ish match. */
export async function countByField(
  field: "department" | "role",
  value: string,
): Promise<number> {
  const col = await employees();
  const rx = new RegExp(`^${escapeRegex(value)}$`, "i");
  return col.countDocuments({ [field]: rx } as Filter<EmployeeRecord>);
}

/** List employees whose department or role matches (case-insensitive). */
export async function listByField(
  field: "department" | "role",
  value: string,
  limit = 25,
): Promise<Employee[]> {
  const col = await employees();
  const rx = new RegExp(`^${escapeRegex(value)}$`, "i");
  const docs = await col
    .find({ [field]: rx } as Filter<EmployeeRecord>)
    .project({ _id: 0, passwordHash: 0 })
    .sort({ name: 1 })
    .limit(limit)
    .toArray();
  return docs as Employee[];
}

/** Free-text search across name / email / role / department / phone. */
export async function searchEmployees(
  term: string,
  limit = 5,
): Promise<Employee[]> {
  const trimmed = term.trim();
  if (!trimmed) return [];
  const col = await employees();
  const rx = new RegExp(escapeRegex(trimmed), "i");
  const docs = await col
    .find({
      $or: [
        { name: rx },
        { email: rx },
        { role: rx },
        { department: rx },
        { phone: rx },
      ],
    })
    .project({ _id: 0, passwordHash: 0 })
    .sort({ name: 1 })
    .limit(limit)
    .toArray();
  return docs as Employee[];
}
