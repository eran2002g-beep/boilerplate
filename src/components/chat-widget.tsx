"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { sendChatMessage } from "@/lib/api";
import { getToken } from "@/lib/client-auth";
import styles from "./chat-widget.module.css";

type ChatMessage = {
  id: string;
  role: "user" | "bot";
  text: string;
  suggestions?: string[];
};

const WELCOME: ChatMessage = {
  id: "welcome",
  role: "bot",
  text:
    "Hi! I'm the Employee Directory assistant. Ask me how to use the app, or about the team.",
  suggestions: [
    "How many employees are there?",
    "Show the breakdown by department",
    "How do I add an employee?",
  ],
};

function newId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Floating help/assistant chat, shown only to signed-in users. */
export function ChatWidget() {
  const pathname = usePathname();
  const [hasToken, setHasToken] = useState(false);
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  // Re-check auth on every navigation (login redirects here, logout leaves).
  useEffect(() => {
    setHasToken(!!getToken());
  }, [pathname]);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, open, busy]);

  const visible = hasToken && pathname !== "/login";
  if (!visible) return null;

  async function ask(question: string) {
    const text = question.trim();
    if (!text || busy) return;

    const userMsg: ChatMessage = { id: newId(), role: "user", text };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setBusy(true);

    try {
      const res = await sendChatMessage(text);
      setMessages((prev) => [
        ...prev,
        {
          id: newId(),
          role: "bot",
          text: res.reply,
          suggestions: res.suggestions,
        },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: newId(),
          role: "bot",
          text:
            err instanceof Error
              ? `Sorry, something went wrong: ${err.message}`
              : "Sorry, something went wrong. Please try again.",
        },
      ]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.root}>
      {open && (
        <section className={styles.panel} aria-label="Assistant chat">
          <header className={styles.header}>
            <div>
              <p className={styles.eyebrow}>Assistant</p>
              <h2 className={styles.title}>Ask about this app</h2>
            </div>
            <button
              type="button"
              className={styles.iconButton}
              onClick={() => setOpen(false)}
              aria-label="Close chat"
            >
              ×
            </button>
          </header>

          <div className={styles.messages} ref={listRef}>
            {messages.map((m) => (
              <div
                key={m.id}
                className={m.role === "user" ? styles.userRow : styles.botRow}
              >
                <div
                  className={
                    m.role === "user" ? styles.userBubble : styles.botBubble
                  }
                >
                  {m.text}
                </div>
                {m.suggestions && m.suggestions.length > 0 && (
                  <div className={styles.suggestions}>
                    {m.suggestions.map((s) => (
                      <button
                        key={s}
                        type="button"
                        className={styles.chip}
                        onClick={() => ask(s)}
                        disabled={busy}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {busy && (
              <div className={styles.botRow}>
                <div className={styles.botBubble}>
                  <span className={styles.typing}>
                    <i />
                    <i />
                    <i />
                  </span>
                </div>
              </div>
            )}
          </div>

          <form
            className={styles.inputRow}
            onSubmit={(e) => {
              e.preventDefault();
              void ask(input);
            }}
          >
            <input
              className={styles.input}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask a question…"
              maxLength={500}
              disabled={busy}
              autoComplete="off"
            />
            <button
              type="submit"
              className={styles.send}
              disabled={busy || !input.trim()}
            >
              Send
            </button>
          </form>
        </section>
      )}

      <button
        type="button"
        className={styles.launcher}
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Close assistant" : "Open assistant"}
      >
        {open ? "×" : "Ask"}
      </button>
    </div>
  );
}
