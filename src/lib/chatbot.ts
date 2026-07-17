/**
 * Rule-based, offline chatbot for the Employee Directory app.
 *
 * It answers two kinds of questions with NO external LLM:
 *   1. "How do I …" app-usage / feature help (from the knowledge base below).
 *   2. Live employee-data questions (counts, breakdowns, lookups) via
 *      read-only MongoDB aggregates in `directory-insights.ts`.
 *
 * The engine is intentionally simple: normalize the text, detect an intent
 * with keyword/pattern heuristics, then format a friendly answer.
 */
import {
  countByField,
  getDirectorySnapshot,
  listByField,
  searchEmployees,
  type GroupCount,
} from "@/lib/directory-insights";
import type { Employee } from "@/lib/types";

export type ChatResponseKind =
  | "greeting"
  | "help"
  | "data"
  | "fallback"
  | "empty";

export type ChatResponse = {
  reply: string;
  kind: ChatResponseKind;
  /** Optional follow-up prompts the UI can render as clickable chips. */
  suggestions?: string[];
};

// ─── Knowledge base (app help) ──────────────────────────────────────────────

type HelpEntry = {
  id: string;
  /** Lowercased keywords/phrases; more specific phrases score higher. */
  keywords: string[];
  answer: string;
};

const HELP_ENTRIES: HelpEntry[] = [
  {
    id: "overview",
    keywords: [
      "what is this",
      "what does this app",
      "what is this app",
      "about the app",
      "purpose",
      "overview",
      "what can this app do",
    ],
    answer:
      "This is an Employee Directory app (Next.js + MongoDB). You can browse, search, add, edit, delete, and photograph employee records through a REST API secured with JWT access tokens, rotating refresh tokens, CSRF protection, and rate limiting.",
  },
  {
    id: "capabilities",
    keywords: [
      "what can you do",
      "who are you",
      "help me",
      "what can you answer",
      "your capabilities",
      "what can i ask",
      "commands",
    ],
    answer:
      "I'm the built-in assistant. I can explain how to use the app (login, adding/editing/deleting employees, photos, search, pagination, security) and answer live questions about the directory such as how many employees there are, the breakdown by department or role, or who works in a given team.",
  },
  {
    id: "login",
    keywords: [
      "log in",
      "login",
      "sign in",
      "how do i log in",
      "credentials",
      "demo account",
      "demo login",
      "cannot log in",
      "can't log in",
    ],
    answer:
      "Go to /login and enter your email and password. Demo accounts: admin@company.com / admin123 (admin), or ava.chen@company.com / password123 (employee). A successful login stores a 15‑minute access token and a 7‑day refresh cookie, so you stay signed in without re‑entering your password.",
  },
  {
    id: "logout",
    keywords: ["log out", "logout", "sign out", "signing out"],
    answer:
      "Click “Log out” in the top‑right of the Employees page. That revokes your refresh token, clears local session data, and returns you to /login.",
  },
  {
    id: "session",
    keywords: [
      "session",
      "token",
      "jwt",
      "expire",
      "expired",
      "refresh token",
      "stay logged in",
      "logged out automatically",
      "auto logout",
    ],
    answer:
      "Sessions use two tokens: a short‑lived 15‑minute encrypted access JWT (sent as a Bearer header) and a 7‑day rotating refresh token stored in an httpOnly cookie. The app silently refreshes the access token about a minute before it expires, so an active session lasts up to 7 days. You're only logged out when a refresh fails (expired, revoked, or reused token).",
  },
  {
    id: "add",
    keywords: [
      "add employee",
      "add an employee",
      "create employee",
      "new employee",
      "add a new",
      "how do i add",
    ],
    answer:
      "Use the “Add employee (POST)” form on the Employees page. Fill in name, email, role, department, an optional phone, and a login password (min 8 chars), then click “Create (POST)”. This calls POST /api/employees.",
  },
  {
    id: "edit",
    keywords: [
      "edit employee",
      "update employee",
      "change employee",
      "edit an employee",
      "modify employee",
      "edit my profile",
    ],
    answer:
      "Click “Edit” on any employee (or “Edit my profile”) to load them into the form, change the fields, and click “Save (PUT)”. Leave the password blank to keep the existing one. Editing calls PUT /api/employees/:id; the “PATCH role” button does a partial PATCH update.",
  },
  {
    id: "delete",
    keywords: [
      "delete employee",
      "remove employee",
      "delete an employee",
      "how do i delete",
      "remove an employee",
    ],
    answer:
      "Click the red “DELETE” button on an employee row and confirm. That calls DELETE /api/employees/:id and permanently removes the record.",
  },
  {
    id: "photo",
    keywords: [
      "photo",
      "picture",
      "image",
      "avatar",
      "upload photo",
      "profile picture",
    ],
    answer:
      "Use the “Photo” button on an employee row to pick an image (JPEG, PNG, WebP, or GIF). It's uploaded as a raw image body to POST /api/employees/:id/photo and shown as their avatar.",
  },
  {
    id: "search",
    keywords: [
      "search",
      "filter",
      "how do i search",
      "find employee",
      "filter by",
      "how to filter",
    ],
    answer:
      "Use the filter form above the list: “Search (q)” matches name/email/role/department, and there are dedicated Role and Department filters. Click “Apply filters”, or “Clear” to reset. You can also just ask me things like “who works in Engineering?”.",
  },
  {
    id: "pagination",
    keywords: [
      "pagination",
      "per page",
      "next page",
      "previous page",
      "page size",
      "how many per page",
    ],
    answer:
      "The list is paginated. Use the “Per page” selector to change page size and the Previous/Next buttons to move between pages. Changing filters or page size restarts at page 1.",
  },
  {
    id: "security",
    keywords: [
      "security",
      "csrf",
      "rate limit",
      "rate limiting",
      "secure",
      "how is it protected",
      "injection",
    ],
    answer:
      "Security layers: encrypted JWT access tokens, rotating refresh tokens (only their SHA‑256 hash is stored), CSRF tokens required on mutating requests, per‑client rate limiting, escaped regex for all filter input, and unique indexes on id and email.",
  },
  {
    id: "api",
    keywords: [
      "api",
      "endpoint",
      "endpoints",
      "rest",
      "routes",
      "curl",
      "http",
    ],
    answer:
      "REST endpoints: POST /api/auth/login, /refresh, /logout; GET /api/auth/csrf and /api/auth/me; GET/POST /api/employees (with ?q=&role=&department=&page=&limit=); GET/PUT/PATCH/DELETE /api/employees/:id; POST /api/employees/:id/photo. All except login/refresh/logout require a Bearer access token.",
  },
];

// ─── Text helpers ───────────────────────────────────────────────────────────

const GREETING_RE =
  /^(hi|hello|hey|yo|hiya|howdy|greetings|good\s+(morning|afternoon|evening))\b/i;
const THANKS_RE = /\b(thanks|thank you|thank u|thx|cheers|appreciate it)\b/i;

const DATA_TRIGGERS = [
  "how many",
  "how much",
  "number of",
  "count",
  "total",
  "list",
  "show me",
  "who is",
  "who's",
  "who are",
  "who works",
  "who work",
  "works in",
  "work in",
  "in the",
  "breakdown",
  "distribution",
  "per department",
  "per role",
  "by department",
  "by role",
  "department",
  "departments",
  "role",
  "roles",
  "team",
  "email of",
  "email for",
  "phone",
  "contact",
  "most",
  "biggest",
  "largest",
];

const HELP_HINTS = ["how do i", "how to", "how can i", "can i", "where do i"];

function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

function includesAny(haystack: string, needles: string[]): boolean {
  return needles.some((n) => haystack.includes(n));
}

/** Singular/plural-tolerant test: does the text mention this value? */
function mentions(text: string, value: string): boolean {
  const v = value.toLowerCase();
  if (text.includes(v)) return true;
  // "engineers" → role "Engineer", "sales team" already covered by includes.
  if (v.endsWith("y") && text.includes(`${v.slice(0, -1)}ies`)) return true;
  return text.includes(`${v}s`);
}

function formatList(items: string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

function describe(emp: Employee): string {
  const bits = [emp.role, emp.department].filter(Boolean).join(", ");
  const contact = [emp.email, emp.phone].filter(Boolean).join(" · ");
  return `${emp.name} — ${bits}${contact ? ` (${contact})` : ""}`;
}

const BASE_SUGGESTIONS = [
  "How many employees are there?",
  "Show the breakdown by department",
  "Who works in Engineering?",
  "How do I add an employee?",
];

// ─── Data-question handling ─────────────────────────────────────────────────

function findMatchingGroup(
  text: string,
  groups: GroupCount[],
): GroupCount | null {
  // Prefer the longest matching value so "Senior Engineer" beats "Engineer".
  const matches = groups
    .filter((g) => mentions(text, g.value))
    .sort((a, b) => b.value.length - a.value.length);
  return matches[0] ?? null;
}

async function handleDataQuestion(
  text: string,
): Promise<ChatResponse | null> {
  const snapshot = await getDirectorySnapshot();

  const wantsCount = includesAny(text, [
    "how many",
    "number of",
    "count",
    "total",
    "how much",
  ]);
  const wantsList = includesAny(text, [
    "list",
    "show me",
    "who works",
    "who work",
    "who are",
    "who is in",
    "who's in",
    "works in",
    "work in",
    "people in",
    "employees in",
    "everyone in",
    "members of",
  ]);
  const wantsBreakdown = includesAny(text, [
    "breakdown",
    "distribution",
    "per department",
    "per role",
    "by department",
    "by role",
    "each department",
    "each role",
    "how many in each",
  ]);

  const dept = findMatchingGroup(text, snapshot.departments);
  const role = findMatchingGroup(text, snapshot.roles);
  const target = pickTarget(text, dept, role);

  // 1. Breakdown / distribution.
  if (wantsBreakdown || (includesAny(text, ["breakdown"]) && !target)) {
    const byRole = includesAny(text, ["role", "roles", "title", "position"]);
    const groups = byRole ? snapshot.roles : snapshot.departments;
    const label = byRole ? "role" : "department";
    const lines = groups.map((g) => `• ${g.value}: ${g.count}`).join("\n");
    return {
      kind: "data",
      reply: `Here's the breakdown by ${label} (${snapshot.total} employees total):\n${lines}`,
      suggestions: BASE_SUGGESTIONS,
    };
  }

  // 2. "What departments / roles exist?"
  if (
    !wantsCount &&
    !wantsList &&
    includesAny(text, ["what department", "which department", "what departments", "which departments", "list departments", "list the departments"])
  ) {
    return {
      kind: "data",
      reply: `There are ${snapshot.departments.length} departments: ${formatList(
        snapshot.departments.map((d) => `${d.value} (${d.count})`),
      )}.`,
      suggestions: ["Who works in " + (snapshot.departments[0]?.value ?? "Engineering") + "?"],
    };
  }
  if (
    !wantsCount &&
    !wantsList &&
    includesAny(text, ["what role", "which role", "what roles", "which roles", "list roles", "list the roles", "what titles"])
  ) {
    return {
      kind: "data",
      reply: `There are ${snapshot.roles.length} roles: ${formatList(
        snapshot.roles.map((r) => `${r.value} (${r.count})`),
      )}.`,
    };
  }

  // 3. Counts.
  if (wantsCount) {
    if (target) {
      const count = await countByField(target.field, target.value);
      return {
        kind: "data",
        reply: `There ${count === 1 ? "is" : "are"} ${count} ${
          count === 1 ? "employee" : "employees"
        } with ${target.field} “${target.value}”.`,
        suggestions: [`Who works in ${target.value}?`],
      };
    }
    // Plain total.
    return {
      kind: "data",
      reply: `There ${snapshot.total === 1 ? "is" : "are"} ${snapshot.total} ${
        snapshot.total === 1 ? "employee" : "employees"
      } in the directory across ${snapshot.departments.length} departments.`,
      suggestions: ["Show the breakdown by department"],
    };
  }

  // 4. "Biggest / largest department".
  if (includesAny(text, ["biggest", "largest", "most people", "most employees"]) ) {
    const byRole = includesAny(text, ["role", "roles", "title"]);
    const groups = byRole ? snapshot.roles : snapshot.departments;
    const top = groups[0];
    if (top) {
      return {
        kind: "data",
        reply: `The largest ${byRole ? "role" : "department"} is ${top.value} with ${top.count} ${
          top.count === 1 ? "employee" : "employees"
        }.`,
      };
    }
  }

  // 5. Listing people in a department/role.
  if (wantsList && target) {
    const people = await listByField(target.field, target.value, 25);
    if (people.length === 0) {
      return {
        kind: "data",
        reply: `I couldn't find anyone with ${target.field} “${target.value}”.`,
      };
    }
    const lines = people.map((p) => `• ${p.name} — ${p.role}, ${p.department}`).join("\n");
    return {
      kind: "data",
      reply: `${people.length} ${people.length === 1 ? "person" : "people"} with ${target.field} “${target.value}”:\n${lines}`,
    };
  }

  // 6. Person lookup (who is X / email/phone of X).
  const personQuery = extractPersonQuery(text);
  if (personQuery) {
    const people = await searchEmployees(personQuery, 5);
    if (people.length === 1) {
      return { kind: "data", reply: describe(people[0]) };
    }
    if (people.length > 1) {
      const lines = people.map((p) => `• ${describe(p)}`).join("\n");
      return {
        kind: "data",
        reply: `I found ${people.length} matches for “${personQuery}”:\n${lines}`,
      };
    }
    return {
      kind: "data",
      reply: `I couldn't find anyone matching “${personQuery}” in the directory.`,
    };
  }

  // 7. Bare "who works in / list <target>" already handled; if we have a target
  //    but no explicit verb, list them anyway.
  if (target) {
    const people = await listByField(target.field, target.value, 25);
    if (people.length > 0) {
      const lines = people.map((p) => `• ${p.name} — ${p.role}, ${p.department}`).join("\n");
      return {
        kind: "data",
        reply: `${people.length} ${people.length === 1 ? "person" : "people"} with ${target.field} “${target.value}”:\n${lines}`,
      };
    }
  }

  return null;
}

function pickTarget(
  text: string,
  dept: GroupCount | null,
  role: GroupCount | null,
): { field: "department" | "role"; value: string } | null {
  if (dept && role) {
    // Choose the more specific (longer) match.
    return dept.value.length >= role.value.length
      ? { field: "department", value: dept.value }
      : { field: "role", value: role.value };
  }
  if (dept) return { field: "department", value: dept.value };
  if (role) return { field: "role", value: role.value };
  // Explicit "in the X department/role" without a known value — nothing to do.
  void text;
  return null;
}

const PERSON_TRIGGERS = [
  "who is",
  "who's",
  "email of",
  "email for",
  "email address of",
  "phone of",
  "phone for",
  "phone number of",
  "phone number for",
  "contact for",
  "contact details for",
  "contact info for",
  "tell me about",
  "info on",
  "information on",
  "details for",
  "details on",
];

function extractPersonQuery(text: string): string | null {
  for (const trigger of PERSON_TRIGGERS) {
    const idx = text.indexOf(trigger);
    if (idx === -1) continue;
    let rest = text.slice(idx + trigger.length).trim();
    // Strip trailing punctuation and filler words.
    rest = rest.replace(/[?.!,]+$/g, "").trim();
    rest = rest.replace(/^(the|a|an)\s+/i, "").trim();
    rest = rest.replace(/\b(please|thanks|thank you)\b/gi, "").trim();
    if (!rest) continue;
    // Ignore role/department words so "who is in sales" isn't a person lookup.
    if (/^(in|from|on)\b/.test(rest)) continue;
    if (rest.length < 2 || rest.length > 60) continue;
    return rest;
  }
  return null;
}

// ─── Help handling ──────────────────────────────────────────────────────────

function scoreHelp(text: string): { entry: HelpEntry; score: number } | null {
  let best: { entry: HelpEntry; score: number } | null = null;
  for (const entry of HELP_ENTRIES) {
    let score = 0;
    for (const kw of entry.keywords) {
      if (text.includes(kw)) {
        // Multi-word phrases are stronger signals than single words.
        score += kw.includes(" ") ? 3 : 1;
      }
    }
    if (score > 0 && (!best || score > best.score)) {
      best = { entry, score };
    }
  }
  return best;
}

// ─── Public entry point ─────────────────────────────────────────────────────

export async function answerChat(rawMessage: string): Promise<ChatResponse> {
  const text = normalize(rawMessage);

  if (!text) {
    return {
      kind: "empty",
      reply: "Ask me anything about this app or the employee directory.",
      suggestions: BASE_SUGGESTIONS,
    };
  }

  if (GREETING_RE.test(text) && text.length <= 40) {
    return {
      kind: "greeting",
      reply:
        "Hi! I'm the Employee Directory assistant. Ask me how to use the app, or about the team — e.g. counts, department breakdowns, or who works where.",
      suggestions: BASE_SUGGESTIONS,
    };
  }

  if (THANKS_RE.test(text) && text.length <= 30) {
    return { kind: "greeting", reply: "You're welcome! Anything else?" };
  }

  const help = scoreHelp(text);
  const helpIsUsage = includesAny(text, HELP_HINTS);
  const looksLikeData = includesAny(text, DATA_TRIGGERS);

  // Usage-style "how do I…" questions favor the help knowledge base.
  if (helpIsUsage && help) {
    return { kind: "help", reply: help.entry.answer };
  }

  if (looksLikeData) {
    try {
      const dataAnswer = await handleDataQuestion(text);
      if (dataAnswer) return dataAnswer;
    } catch {
      // Fall through to help / fallback on any DB error.
    }
  }

  if (help) {
    return { kind: "help", reply: help.entry.answer };
  }

  // Last resort: try a person/data lookup even without an obvious trigger.
  try {
    const dataAnswer = await handleDataQuestion(text);
    if (dataAnswer) return dataAnswer;
  } catch {
    // ignore
  }

  return {
    kind: "fallback",
    reply:
      "I'm not sure about that one. I can help with using the app (login, adding/editing/deleting employees, photos, search, security) or answer directory questions like counts, department/role breakdowns, and who works where.",
    suggestions: BASE_SUGGESTIONS,
  };
}
