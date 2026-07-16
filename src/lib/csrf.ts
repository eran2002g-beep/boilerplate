import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";

export const CSRF_COOKIE = "csrf_token";
export const CSRF_HEADER = "x-csrf-token";

function csrfSecret() {
  return process.env.CSRF_SECRET || process.env.JWT_SECRET || "csrf-dev-secret";
}

/** Signed CSRF token: random.payload + hmac */
export function createCsrfToken(): string {
  const nonce = randomBytes(24).toString("hex");
  const sig = createHmac("sha256", csrfSecret()).update(nonce).digest("hex");
  return `${nonce}.${sig}`;
}

export function isValidCsrfToken(token: string): boolean {
  const [nonce, sig] = token.split(".");
  if (!nonce || !sig) return false;
  const expected = createHmac("sha256", csrfSecret()).update(nonce).digest("hex");
  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export function setCsrfCookie(response: NextResponse, token: string) {
  response.cookies.set(CSRF_COOKIE, token, {
    httpOnly: false, // double-submit: JS must read and send as header
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 8,
  });
}

export function clearCsrfCookie(response: NextResponse) {
  response.cookies.set(CSRF_COOKIE, "", {
    httpOnly: false,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}

export function requireCsrf(
  request: NextRequest,
): { ok: true } | { error: Response } {
  const method = request.method.toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
    return { ok: true };
  }

  const cookie = request.cookies.get(CSRF_COOKIE)?.value;
  const header = request.headers.get(CSRF_HEADER);

  if (!cookie || !header || cookie !== header || !isValidCsrfToken(cookie)) {
    return {
      error: Response.json(
        { error: "Invalid or missing CSRF token" },
        { status: 403 },
      ),
    };
  }

  return { ok: true };
}
