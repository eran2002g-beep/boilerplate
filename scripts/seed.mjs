/**
 * Wipe + seed MongoDB demo data.
 * Usage: npm run seed
 *
 * Creates:
 *   - admin@company.com / admin123  (admins collection)
 *   - several dummy employees       (password: password123)
 */
import { MongoClient } from "mongodb";
import bcrypt from "bcryptjs";

const uri = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017";
const dbName = process.env.MONGODB_DB || "employee_directory";

const ADMIN_PASSWORD = "admin123";
const EMPLOYEE_PASSWORD = "password123";

const DUMMY_EMPLOYEES = [
  {
    id: "emp-001",
    name: "Ava Chen",
    email: "ava.chen@company.com",
    role: "Engineer",
    department: "Product",
    phone: "+1-555-0101",
  },
  {
    id: "emp-002",
    name: "Jordan Blake",
    email: "jordan.blake@company.com",
    role: "Designer",
    department: "Design",
    phone: "+1-555-0102",
  },
  {
    id: "emp-003",
    name: "Sam Rivera",
    email: "sam.rivera@company.com",
    role: "Product Manager",
    department: "Product",
    phone: "+1-555-0103",
  },
  {
    id: "emp-004",
    name: "Casey Nguyen",
    email: "casey.nguyen@company.com",
    role: "Engineer",
    department: "Platform",
    phone: "+1-555-0104",
  },
  {
    id: "emp-005",
    name: "Riley Patel",
    email: "riley.patel@company.com",
    role: "HR Specialist",
    department: "People",
    phone: "+1-555-0105",
  },
  {
    id: "emp-006",
    name: "Morgan Lee",
    email: "morgan.lee@company.com",
    role: "Finance Analyst",
    department: "Finance",
    phone: "+1-555-0106",
  },
];

async function main() {
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(dbName);

  const admins = db.collection("admins");
  const employees = db.collection("employees");

  console.log(`Connected to ${uri} / ${dbName}`);

  const wipedAdmins = await admins.deleteMany({});
  const wipedEmployees = await employees.deleteMany({});
  console.log(
    `Wiped ${wipedAdmins.deletedCount} admin(s), ${wipedEmployees.deletedCount} employee(s)`,
  );

  const adminHash = await bcrypt.hash(ADMIN_PASSWORD, 10);
  const employeeHash = await bcrypt.hash(EMPLOYEE_PASSWORD, 10);
  const now = new Date().toISOString();

  await admins.insertOne({
    id: "admin-1",
    email: "admin@company.com",
    name: "Admin User",
    passwordHash: adminHash,
    createdAt: now,
    updatedAt: now,
  });

  await employees.insertMany(
    DUMMY_EMPLOYEES.map((emp, i) => ({
      ...emp,
      email: emp.email.toLowerCase(),
      photoUrl: null,
      passwordHash: employeeHash,
      createdAt: new Date(Date.UTC(2026, 0, 10 + i, 10, 0, 0)).toISOString(),
      updatedAt: new Date(Date.UTC(2026, 0, 10 + i, 10, 0, 0)).toISOString(),
    })),
  );

  await employees.createIndexes([
    { key: { email: 1 }, name: "uniq_email", unique: true },
    { key: { id: 1 }, name: "uniq_id", unique: true },
    { key: { role: 1 }, name: "by_role" },
    { key: { department: 1 }, name: "by_department" },
  ]);
  await admins.createIndexes([
    { key: { email: 1 }, name: "uniq_email", unique: true },
    { key: { id: 1 }, name: "uniq_id", unique: true },
  ]);

  console.log("Seeded admin: admin@company.com / admin123");
  console.log(
    `Seeded ${DUMMY_EMPLOYEES.length} employees (password: password123)`,
  );
  for (const emp of DUMMY_EMPLOYEES) {
    console.log(`  - ${emp.email}`);
  }

  await client.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
