import { NextRequest, NextResponse } from "next/server";
import { answerChat } from "@/lib/chatbot";
import { guardApi } from "@/lib/security";

const MAX_MESSAGE_LEN = 500;

// Strip control chars (except normal whitespace) from free-text input.
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

/**
 * POST /api/chat — ask the built-in assistant a question.
 * Authenticated + CSRF-protected + rate limited (via guardApi).
 * Body: { message: string }.
 */
export async function POST(request: NextRequest) {
  const auth = await guardApi(request, { mutate: true, limit: 30 });
  if ("error" in auth) return auth.error;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const raw =
    body && typeof body === "object" && "message" in body
      ? (body as { message?: unknown }).message
      : undefined;

  if (typeof raw !== "string") {
    return NextResponse.json({ error: "message is required" }, { status: 400 });
  }

  const message = raw.replace(CONTROL_CHARS, "").trim();
  if (!message) {
    return NextResponse.json({ error: "message is required" }, { status: 400 });
  }
  if (message.length > MAX_MESSAGE_LEN) {
    return NextResponse.json(
      { error: `message must be at most ${MAX_MESSAGE_LEN} characters` },
      { status: 400 },
    );
  }

  const answer = await answerChat(message);
  return NextResponse.json(answer);
}
