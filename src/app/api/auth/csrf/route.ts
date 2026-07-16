import { NextRequest, NextResponse } from "next/server";
import { createCsrfToken, setCsrfCookie } from "@/lib/csrf";
import { requireAuth } from "@/lib/auth";

/** Refresh CSRF cookie/token for an authenticated session. */
export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if ("error" in auth) return auth.error;

  const csrfToken = createCsrfToken();
  const response = NextResponse.json({ csrfToken });
  setCsrfCookie(response, csrfToken);
  return response;
}
