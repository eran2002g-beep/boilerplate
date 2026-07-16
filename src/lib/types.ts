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

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  kind: "admin" | "employee";
};

export function toPublicEmployee(record: EmployeeRecord): Employee {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { passwordHash, ...publicEmployee } = record;
  return publicEmployee;
}
