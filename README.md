# netup-exe-201

NetUp is a web-first sports court booking platform for players, venue owners, and
platform admins. Sprint 0 establishes the local development foundation:

- Next.js 15 frontend on port `3000`
- FastAPI backend on port `8000`
- PostgreSQL 16 on port `5432`
- Redis on port `6379`
- Adminer database UI on port `8080`
- Alembic migration pipeline using `backend/database/schema.sql`

## Run Locally

Create local app env files from examples and fill secrets outside git:

```bash
cp .env.example .env
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

The root `.env` controls Docker Compose host ports and public base URLs.
Backend secrets and OAuth keys belong in `backend/.env`; frontend should only
contain public browser-safe values such as `NEXT_PUBLIC_API_BASE_URL`.
Gemini credentials for video assessment also belong in `backend/.env`
(`GEMINI_API_KEY`, `GEMINI_MODEL`, `GEMINI_TIMEOUT_SECONDS`).

To switch between local development and a public EC2 DNS, edit only
`NETUP_ENV_TARGET` in the root `.env`, then sync derived env values:

```bash
NETUP_ENV_TARGET=localhost
# or
NETUP_ENV_TARGET=netup.com.vn

python3 scripts/sync_env.py
```

The sync updates CORS, frontend/backend base URLs, Google callback,
VNPay return URL, and browser-facing API URL while preserving secrets.

```bash
docker compose up --build
```

If a host port is already reserved, override only the published host port:

```bash
POSTGRES_HOST_PORT=55432 docker compose up --build
```

Useful URLs:

- Frontend: http://localhost:3000
- API health: http://localhost:8000/api/v1/health/live
- API readiness: http://localhost:8000/api/v1/health/ready
- API docs: http://localhost:8000/api/docs
- Database UI: http://localhost:8080
- Hidden admin login: http://localhost:3000/_internal/netup-admin/login
- Admin dashboard: http://localhost:3000/_internal/netup-admin/dashboard
- Admin config: http://localhost:3000/_internal/netup-admin/config
- Admin owner approval: http://localhost:3000/_internal/netup-admin/owner-requests
- Admin owner accounts: http://localhost:3000/_internal/netup-admin/owners
- User login: http://localhost:3000/login
- Owner dashboard: http://localhost:3000/owner/dashboard
- Owner courts: http://localhost:3000/owner/courts
- Owner check-in: http://localhost:3000/owner/check-in
- Owner retail and invoices: http://localhost:3000/owner/sales
- Player discovery: http://localhost:3000/player/discovery
- Player bookings: http://localhost:3000/player/bookings
- Player bills: http://localhost:3000/player/bills
- Player matches: http://localhost:3000/player/matches
- Google login entry: http://localhost:8000/api/v1/auth/google/start

Adminer login:

```text
System: PostgreSQL
Server: postgres
Username: netup
Password: netup
Database: netup
```

Development admin login:

```text
Username: admin
Password: admin12345
```

## Production user import

`new_user.txt` is the source of truth for bulk user import. The importer reads
only its tab-separated records and does not create synthetic accounts, demo
invoices, or seeded traffic. Student codes are validated for the HE/HS 16–18
cohorts before an account is created.

Google OAuth local callback:

```text
http://localhost:8000/api/v1/auth/google/callback
```

## Local Checks

Backend:

```bash
cd backend
python -m pip install -e ".[dev]"
python -m ruff check .
python -m pytest
alembic upgrade head
```

Frontend:

```bash
cd frontend
pnpm install --frozen-lockfile
pnpm build
```

Docker:

```bash
docker compose config
docker compose up -d postgres redis adminer backend-api frontend
```

## EC2 Nginx Deploy

The `frontend` service runs `pnpm build` and writes the static export to
`frontend/out`. The production `nginx` service listens on host port `80`, serves
that folder directly, and proxies `/api/*`, `/uploads/*`, and `/ws/*` to
`backend-api:8000` inside Docker Compose.

Current public URL:

```text
http://netup.com.vn
```

Deploy from EC2:

```bash
git pull
docker compose up -d
```

Register these external callback URLs with the providers:

```text
Google OAuth redirect:
http://netup.com.vn/api/v1/auth/google/callback

VNPay return URL:
http://netup.com.vn/api/v1/payments/vnpay/return
```

## Project Docs

- Product requirements: `business.md`
- Sprint plan and checklist: `system-plan-checklist.md`
- Database design: `backend/database/README.md`
- Table overview: `backend/database/tables-overview.md`
- Use case to table mapping: `backend/database/usecase-flow-table-mapping.md`
- Sprint 9 ops docs: `ops/sprint9/`
- Production nginx static config: `ops/production/nginx/netup-static.conf`
