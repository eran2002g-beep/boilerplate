import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { requireCsrf } from "@/lib/csrf";
import { clientKey, rateLimit } from "@/lib/rate-limit";
import type { AuthUser } from "@/lib/types";

export async function guardApi(
  request: NextRequest,
  options: {
    mutate?: boolean;
    rateLimitKey?: string;
    limit?: number;
    windowMs?: number;
  } = {},
): Promise<{ user: AuthUser } | { error: Response }> {
  const key = clientKey(
    request,
    options.rateLimitKey ?? (options.mutate ? "api-mutate" : "api-read"),
  );
  const limited = rateLimit(
    key,
    options.limit ?? (options.mutate ? 60 : 120),
    options.windowMs ?? 60_000,
  );

  if (!limited.ok) {
    return {
      error: NextResponse.json(
        { error: "Too many requests. Try again later." },
        {
          status: 429,
          headers: { "Retry-After": String(limited.retryAfterSec) },
        },
      ),
    };
  }

  if (options.mutate) {
    const csrf = requireCsrf(request);
    if ("error" in csrf) return csrf;
  }

  return requireAuth(request);
}
