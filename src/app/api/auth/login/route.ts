import { NextRequest, NextResponse } from "next/server";
import { authenticate, signToken } from "@/lib/auth";
import { createCsrfToken, setCsrfCookie } from "@/lib/csrf";
import { setRefreshCookie } from "@/lib/refresh-cookie";
import { issueRefreshToken } from "@/lib/refresh-tokens";
import { clientKey, rateLimit } from "@/lib/rate-limit";
import { sanitizeEmail } from "@/lib/sanitize";
import { ACCESS_TOKEN_TTL_MS } from "@/lib/session-ttl";

export async function POST(request: NextRequest) {
  const limited = rateLimit(clientKey(request, "login"), 8, 60_000);
  if (!limited.ok) {
    return NextResponse.json(
      { error: "Too many login attempts. Try again later." },
      {
        status: 429,
        headers: { "Retry-After": String(limited.retryAfterSec) },
      },
    );
  }

  let body: { email?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (typeof body.email !== "string" || typeof body.password !== "string") {
    return NextResponse.json(
      { error: "email and password are required" },
      { status: 400 },
    );
  }

  const email = sanitizeEmail(body.email);
  if (!email.ok) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  const user = await authenticate(email.value, body.password);
  if (!user) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  const token = await signToken(user);
  const refreshToken = await issueRefreshToken(user);
  const csrfToken = createCsrfToken();

  const response = NextResponse.json({
    token,
    csrfToken,
    expiresIn: Math.floor(ACCESS_TOKEN_TTL_MS / 1000),
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      kind: user.kind,
    },
  });

  setRefreshCookie(response, refreshToken);
  setCsrfCookie(response, csrfToken);
  return response;
}
