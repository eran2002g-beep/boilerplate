export type EmployeeRecord = {
  id: string;
  name: string;
  email: string;
  role: string;
  department: string;
  phone?: string;
  photoUrl?: string | null;
  passwordHash: string;
  createdAt: string;
  updatedAt: string;
};

/** Safe to send to the client — never includes passwordHash */
export type Employee = Omit<EmployeeRecord, "passwordHash">;

export type CreateEmployeeInput = {
  name: string;
  email: string;
  role: string;
  department: string;
  phone?: string;
  password: string;
};

export type UpdateEmployeeInput = Partial<
  Omit<CreateEmployeeInput, "password">
> & {
  password?: string;
};

export type AdminRecord = {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  createdAt: string;
  updatedAt: string;
};

/** Safe to send to the client — never includes passwordHash */
export type Admin = Omit<AdminRecord, "passwordHash">;

export type CreateAdminInput = {
  name: string;
  email: string;
  password: string;
};

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  kind: "admin" | "employee";
};

export function toPublicAdmin(record: AdminRecord): Admin {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { passwordHash, ...publicAdmin } = record;
  return publicAdmin;
}

export function toPublicEmployee(record: EmployeeRecord): Employee {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { passwordHash, ...publicEmployee } = record;
  return publicEmployee;
}
