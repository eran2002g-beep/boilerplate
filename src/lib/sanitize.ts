/**
 * Reject payloads that look like injection attempts.
 * We store data as structured JSON (no string-built SQL), but still
 * block classic SQL / script injection patterns in free-text fields.
 */

const INJECTION_PATTERNS = [
  /(\b)(union\s+select|select\s+.+\s+from|insert\s+into|drop\s+table|delete\s+from|update\s+\w+\s+set|alter\s+table|exec(\s|\())/i,
  /(--|\/\*|\*\/|;--)/,
  /('|")\s*(or|and)\s+('|")?\d+('|")?\s*=\s*('|")?\d+/i,
  /<script\b|javascript:|onerror\s*=|onload\s*=/i,
  /\0/,
];

export function looksLikeInjection(value: string): boolean {
  return INJECTION_PATTERNS.some((re) => re.test(value));
}

export function sanitizeText(
  value: string,
  field: string,
  maxLen = 120,
): { ok: true; value: string } | { ok: false; error: string } {
  const trimmed = value.trim().normalize("NFKC");

  if (!trimmed) return { ok: false, error: `${field} is required` };
  if (trimmed.length > maxLen) {
    return { ok: false, error: `${field} must be at most ${maxLen} characters` };
  }
  if (looksLikeInjection(trimmed)) {
    return { ok: false, error: `${field} contains disallowed characters` };
  }

  // Strip control chars except tab/newline (we disallow those in most fields)
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(trimmed)) {
    return { ok: false, error: `${field} contains invalid characters` };
  }

  return { ok: true, value: trimmed };
}

/** Optional filter param — empty string is allowed (means “no filter”). */
export function sanitizeFilter(
  value: string | null,
  field: string,
  maxLen = 80,
): { ok: true; value: string | undefined } | { ok: false; error: string } {
  if (value == null || !value.trim()) return { ok: true, value: undefined };
  const result = sanitizeText(value, field, maxLen);
  if (!result.ok) return result;
  return { ok: true, value: result.value };
}

export function sanitizeEmail(
  value: string,
): { ok: true; value: string } | { ok: false; error: string } {
  const email = value.trim().toLowerCase().normalize("NFKC");
  const emailRe = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/;

  if (!emailRe.test(email) || email.length > 254) {
    return { ok: false, error: "valid email is required" };
  }
  if (looksLikeInjection(email)) {
    return { ok: false, error: "email contains disallowed characters" };
  }

  return { ok: true, value: email };
}

export function sanitizeId(
  id: string,
): { ok: true; value: string } | { ok: false; error: string } {
  // Only allow our employee id format — never pass raw id into a query string
  if (!/^emp-[a-zA-Z0-9-]{1,40}$/.test(id)) {
    return { ok: false, error: "Invalid employee id" };
  }
  return { ok: true, value: id };
}
