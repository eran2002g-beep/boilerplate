import bcrypt from "bcryptjs";

const ROUNDS = 10;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, ROUNDS);
}

export async function verifyPassword(
  plain: string,
  passwordHash: string,
): Promise<boolean> {
  return bcrypt.compare(plain, passwordHash);
}

export function isStrongEnoughPassword(password: string): string | null {
  if (password.length < 8) return "password must be at least 8 characters";
  if (password.length > 72) return "password must be at most 72 characters";
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    return "password must include letters and numbers";
  }
  return null;
}
