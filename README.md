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

## API

| Method | Path | Notes |
| ------ | ---- | ----- |
| `POST` | `/api/auth/login` | `{ token, csrfToken, user }` |
| `GET` | `/api/auth/me` | Logged-in profile |
| `GET` | `/api/employees?q=&role=&department=` | Filtered list |
| `POST` | `/api/employees` | Create |
| `GET/PUT/PATCH/DELETE` | `/api/employees/:id` | CRUD |
| `POST` | `/api/employees/:id/photo` | Upload photo |
