# Employee Directory (Next.js + MongoDB)

One package: React UI + REST API. Employee data is stored in **MongoDB** (not local JSON).

## Prerequisites

MongoDB running locally (or set `MONGODB_URI` to Atlas):

```bash
# example local start (data dir in project)
mongod --dbpath ./.mongo-data --port 27017 --bind_ip 127.0.0.1 --nounixsocket
```

Copy env:

```bash
cp .env.example .env.local
```

| Variable | Default |
| -------- | ------- |
| `MONGODB_URI` | `mongodb://127.0.0.1:27017` |
| `MONGODB_DB` | `employee_directory` |
| `JWT_SECRET` | `dev-secret-change-me-in-production` (used for access-token encryption) |
| `CSRF_SECRET` | falls back to `JWT_SECRET` |

## Demo accounts

| Who | Email | Password |
| --- | ----- | -------- |
| Admin | `admin@company.com` | `admin123` |
| Employee | `ava.chen@company.com` | `password123` |
| Employee | `jordan.blake@company.com` | `password123` |

Seed employees are inserted automatically when the `employees` collection is empty. Passwords are bcrypt-hashed and never returned by the API.

## Run

```bash
npm run dev
```

## Security

- JWT + CSRF + rate limiting
- MongoDB driver queries (no string-built queries); filter regex input is escaped
- Unique indexes on `id` and `email`

### Authentication (access + refresh tokens)

Two-token scheme so sessions stay alive without long-lived API credentials.

| Token | Lifetime | Storage | Purpose |
| ----- | -------- | ------- | ------- |
| Access (encrypted JWT) | 15 min | `localStorage`, sent as `Authorization: Bearer` | Short-lived proof of identity on each API call |
| Refresh (opaque, rotating) | 7 days | httpOnly `refresh_token` cookie; SHA-256 hash in `refresh_tokens` | Obtain a new access JWT without re-entering a password |

#### Login

1. Client posts email/password to `POST /api/auth/login`.
2. Server verifies credentials, then issues:
   - a **15m encrypted access JWT** in the JSON body
   - a **7d refresh token** as an httpOnly cookie (only the hash is stored in MongoDB)
   - a CSRF token for mutating requests
3. Browser saves the access token, user, CSRF, and expiry timestamp in `localStorage`, then schedules a silent refresh.

#### Using the API

Authenticated calls go through the shared client (`src/lib/api.ts`):

1. If the access token is within ~1 minute of expiry, refresh first.
2. Send `Authorization: Bearer <access JWT>`.
3. The server decrypts/verifies the JWT; invalid or expired → `401`.

#### Silent refresh

Triggered by:

- a timer ~1 minute before access expiry (`SessionWatcher`)
- the tab becoming visible again
- any API response with `401`

Flow:

1. `POST /api/auth/refresh` (browser sends the httpOnly cookie automatically).
2. Server looks up the hashed refresh token and checks it is not revoked or expired.
3. **Rotation**: old refresh token is revoked; a new one is issued and the cookie is updated (reuse of the old token is rejected).
4. Client stores the new access JWT (+ CSRF), reschedules the next refresh, and retries the failed request once if needed.

An active user can therefore stay signed in for up to **7 days** while each API call only uses a short-lived JWT.

#### Auto-logout

Auto-logout runs when **refresh fails**, not merely when the access JWT expires.

`forceLogout()` is called if the refresh token is missing, expired, or revoked, or if `/api/auth/refresh` returns `401`. It then:

1. Clears `localStorage` (access token, user, CSRF, expiry)
2. Calls `POST /api/auth/logout` to revoke the refresh token and clear cookies
3. Redirects to `/login`

Manual logout uses the same revoke + clear path. Refresh records also auto-expire via a MongoDB TTL index on `expiresAt`.

```
Login
  → access JWT (15m) + refresh cookie (7d)

~14 minutes later
  → silent refresh → new access JWT + rotated refresh cookie

Repeat until refresh fails (expired after 7d, logout, or token reuse)
  → auto-logout → /login
```

## API

| Method | Path | Notes |
| ------ | ---- | ----- |
| `POST` | `/api/auth/login` | `{ token, csrfToken, expiresIn, user }` + sets refresh cookie |
| `POST` | `/api/auth/refresh` | Rotates refresh cookie, returns a new access token |
| `POST` | `/api/auth/logout` | Revokes refresh token, clears cookies |
| `GET` | `/api/auth/csrf` | Refresh CSRF token for the session |
| `GET` | `/api/auth/me` | Logged-in profile |
| `GET` | `/api/employees?q=&role=&department=` | Filtered list |
| `POST` | `/api/employees` | Create |
| `GET/PUT/PATCH/DELETE` | `/api/employees/:id` | CRUD |
| `POST` | `/api/employees/:id/photo` | Upload photo |
| `POST` | `/api/chat` | Built-in assistant — `{ message }` → `{ reply, kind, suggestions? }` |

## Assistant (chatbot)

A signed-in-only floating assistant (bottom-right) answers questions about the app with **no external LLM** — it's a rule-based engine:

- **App help** — how to log in, add/edit/delete employees, upload photos, search, pagination, sessions, and security (knowledge base in `src/lib/chatbot.ts`).
- **Live directory data** — counts, per-department/role breakdowns, "who works in X", and person lookups, via read-only MongoDB aggregates in `src/lib/directory-insights.ts`.

The endpoint reuses the same auth + CSRF + rate-limit guard as the rest of the API.
