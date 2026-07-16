import { NextRequest, NextResponse } from "next/server";
import { signToken } from "@/lib/auth";
import { createCsrfToken, setCsrfCookie } from "@/lib/csrf";
import { REFRESH_COOKIE, setRefreshCookie } from "@/lib/refresh-cookie";
import { rotateRefreshToken } from "@/lib/refresh-tokens";
import { ACCESS_TOKEN_TTL_MS } from "@/lib/session-ttl";
import { clientKey, rateLimit } from "@/lib/rate-limit";

/** Exchange a valid refresh cookie for a new access token (and rotated refresh). */
export async function POST(request: NextRequest) {
  const limited = rateLimit(clientKey(request, "refresh"), 30, 60_000);
  if (!limited.ok) {
    return NextResponse.json(
      { error: "Too many refresh attempts. Try again later." },
      {
        status: 429,
        headers: { "Retry-After": String(limited.retryAfterSec) },
      },
    );
  }

  const raw = request.cookies.get(REFRESH_COOKIE)?.value;
  if (!raw) {
    return NextResponse.json(
      { error: "Missing refresh token" },
      { status: 401 },
    );
  }

  const rotated = await rotateRefreshToken(raw);
  if (!rotated) {
    const response = NextResponse.json(
      { error: "Invalid or expired refresh token" },
      { status: 401 },
    );
    response.cookies.set(REFRESH_COOKIE, "", {
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 0,
    });
    return response;
  }

  const token = await signToken(rotated.user);
  const csrfToken = createCsrfToken();

  const response = NextResponse.json({
    token,
    csrfToken,
    expiresIn: Math.floor(ACCESS_TOKEN_TTL_MS / 1000),
    user: {
      id: rotated.user.id,
      email: rotated.user.email,
      name: rotated.user.name,
      kind: rotated.user.kind,
    },
  });

  setRefreshCookie(response, rotated.refreshToken);
  setCsrfCookie(response, csrfToken);
  return response;
}
