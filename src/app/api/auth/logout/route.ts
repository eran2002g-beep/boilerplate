import { NextRequest, NextResponse } from "next/server";
import { clearCsrfCookie } from "@/lib/csrf";
import { clearRefreshCookie, REFRESH_COOKIE } from "@/lib/refresh-cookie";
import { revokeRefreshToken } from "@/lib/refresh-tokens";

export async function POST(request: NextRequest) {
  const raw = request.cookies.get(REFRESH_COOKIE)?.value;
  if (raw) {
    await revokeRefreshToken(raw);
  }

  const response = NextResponse.json({ ok: true });
  clearRefreshCookie(response);
  clearCsrfCookie(response);
  return response;
}
