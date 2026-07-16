import { isStrongEnoughPassword } from "@/lib/password";
import { sanitizeEmail, sanitizeText } from "@/lib/sanitize";
import type { CreateEmployeeInput, UpdateEmployeeInput } from "./types";

function parseCoreFields(input: Record<string, unknown>): {
  data?: Omit<CreateEmployeeInput, "password">;
  error?: string;
} {
  if (typeof input.name !== "string") return { error: "name is required" };
  if (typeof input.email !== "string") return { error: "email is required" };
  if (typeof input.role !== "string") return { error: "role is required" };
  if (typeof input.department !== "string") {
    return { error: "department is required" };
  }
  if (input.phone !== undefined && typeof input.phone !== "string") {
    return { error: "phone must be a string" };
  }

  const name = sanitizeText(input.name, "name", 80);
  if (!name.ok) return { error: name.error };
  const email = sanitizeEmail(input.email);
  if (!email.ok) return { error: email.error };
  const role = sanitizeText(input.role, "role", 60);
  if (!role.ok) return { error: role.error };
  const department = sanitizeText(input.department, "department", 60);
  if (!department.ok) return { error: department.error };

  let phone: string | undefined;
  if (typeof input.phone === "string" && input.phone.trim()) {
    const p = sanitizeText(input.phone, "phone", 30);
    if (!p.ok) return { error: p.error };
    phone = p.value;
  }

  return {
    data: {
      name: name.value,
      email: email.value,
      role: role.value,
      department: department.value,
      phone,
    },
  };
}

export function validateCreate(body: unknown): {
  data?: CreateEmployeeInput;
  error?: string;
} {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { error: "Request body must be a JSON object" };
  }

  const input = body as Record<string, unknown>;
  const core = parseCoreFields(input);
  if (core.error || !core.data) return { error: core.error };

  if (typeof input.password !== "string") {
    return { error: "password is required" };
  }
  const pwdErr = isStrongEnoughPassword(input.password);
  if (pwdErr) return { error: pwdErr };

  return { data: { ...core.data, password: input.password } };
}

/** PUT: all profile fields required; password optional (omit to keep current). */
export function validateReplace(body: unknown): {
  data?: CreateEmployeeInput;
  error?: string;
} {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { error: "Request body must be a JSON object" };
  }

  const input = body as Record<string, unknown>;
  const core = parseCoreFields(input);
  if (core.error || !core.data) return { error: core.error };

  if (typeof input.password === "string" && input.password.length > 0) {
    const pwdErr = isStrongEnoughPassword(input.password);
    if (pwdErr) return { error: pwdErr };
    return { data: { ...core.data, password: input.password } };
  }

  return { data: { ...core.data, password: "" } };
}

export function validatePatch(body: unknown): {
  data?: UpdateEmployeeInput;
  error?: string;
} {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { error: "Request body must be a JSON object" };
  }

  const input = body as Record<string, unknown>;
  const data: UpdateEmployeeInput = {};

  if ("name" in input) {
    if (typeof input.name !== "string") return { error: "name must be a string" };
    const name = sanitizeText(input.name, "name", 80);
    if (!name.ok) return { error: name.error };
    data.name = name.value;
  }
  if ("email" in input) {
    if (typeof input.email !== "string") {
      return { error: "email must be a string" };
    }
    const email = sanitizeEmail(input.email);
    if (!email.ok) return { error: email.error };
    data.email = email.value;
  }
  if ("role" in input) {
    if (typeof input.role !== "string") return { error: "role must be a string" };
    const role = sanitizeText(input.role, "role", 60);
    if (!role.ok) return { error: role.error };
    data.role = role.value;
  }
  if ("department" in input) {
    if (typeof input.department !== "string") {
      return { error: "department must be a string" };
    }
    const department = sanitizeText(input.department, "department", 60);
    if (!department.ok) return { error: department.error };
    data.department = department.value;
  }
  if ("phone" in input) {
    if (typeof input.phone !== "string") {
      return { error: "phone must be a string" };
    }
    if (input.phone.trim()) {
      const phone = sanitizeText(input.phone, "phone", 30);
      if (!phone.ok) return { error: phone.error };
      data.phone = phone.value;
    } else {
      data.phone = "";
    }
  }
  if ("password" in input) {
    if (typeof input.password !== "string") {
      return { error: "password must be a string" };
    }
    const pwdErr = isStrongEnoughPassword(input.password);
    if (pwdErr) return { error: pwdErr };
    data.password = input.password;
  }

  if (Object.keys(data).length === 0) {
    return { error: "Provide at least one field to update" };
  }

  return { data };
}
