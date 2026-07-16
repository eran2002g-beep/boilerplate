import { NextResponse } from "next/server";
import { clearCsrfCookie } from "@/lib/csrf";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  clearCsrfCookie(response);
  return response;
}
