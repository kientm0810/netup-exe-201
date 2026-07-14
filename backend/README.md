# NetUp Backend

FastAPI backend foundation for NetUp.

## Development

```bash
python -m pip install -e ".[dev]"
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

## Environment

Copy local env:

```bash
cp .env.example .env
```

```bash
APP_ENV=development
DATABASE_URL=postgresql+psycopg://netup:netup@localhost:5432/netup
REDIS_URL=redis://localhost:6379/0
CORS_ORIGINS=http://localhost:3000
FRONTEND_BASE_URL=http://localhost:3000
APP_SECRET_KEY=dev-only-change-me
ADMIN_SEED_ENABLED=true
ADMIN_SEED_USERNAME=admin
ADMIN_SEED_PASSWORD=admin12345
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_REDIRECT_URI=http://localhost:8000/api/v1/auth/google/callback
BACKEND_BASE_URL=http://localhost:8000
VNPAY_PAYMENT_URL=https://sandbox.vnpayment.vn/paymentv2/vpcpay.html
VNPAY_TMN_CODE=
VNPAY_HASH_SECRET=
VNPAY_RETURN_URL=http://localhost:8000/api/v1/payments/vnpay/return
VNPAY_LOCALE=vn
VNPAY_ORDER_TYPE=other
ADMIN_LOGIN_MAX_ATTEMPTS=5
ADMIN_LOGIN_WINDOW_MINUTES=15
ADMIN_LOGIN_BLOCK_MINUTES=15
GEMINI_API_KEY=
GEMINI_MODEL=gemini-2.5-flash-lite
GEMINI_TIMEOUT_SECONDS=45
VIDEO_ASSESSMENT_MAX_SIZE_MB=5
VIDEO_ASSESSMENT_MAX_DURATION_SECONDS=60
```

## Migrations

The initial Alembic migration executes `database/schema.sql`.

```bash
alembic upgrade head
```

## Checks

```bash
python -m ruff check .
python -m pytest
```

## Health Endpoints

- `GET /api/v1/health/live`
- `GET /api/v1/health/ready`

## Admin Auth Endpoints

- `POST /api/v1/admin/auth/login`
- `POST /api/v1/admin/auth/refresh`
- `POST /api/v1/admin/auth/logout`
- `GET /api/v1/admin/auth/me`

## Admin Operations Endpoints

- `GET /api/v1/admin/config`
- `PUT /api/v1/admin/config`
- `GET /api/v1/admin/dashboard/metrics`
- `GET /api/v1/admin/audit-logs`
- `GET /api/v1/admin/owners`
- `POST /api/v1/admin/owners` (super-admin only; provisions an owner role and
  local username/password account)

Dashboard metrics include website visits, new visitors, registered accounts,
active registered users, returning visitors, and a 30-day daily series. The
analytics period for new/active/returning users is 30 days.

The dev container seeds a local admin account when `ADMIN_SEED_ENABLED=true`.
Admin login brute-force protection applies per username/IP window and returns
`429 admin_login_rate_limited` when the threshold is exceeded.

## User Auth Endpoints

- `GET /api/v1/auth/google/start`
- `GET /api/v1/auth/google/callback`
- `GET /api/v1/auth/me`
- `POST /api/v1/auth/local/login`
- `POST /api/v1/auth/refresh`
- `POST /api/v1/auth/logout`

Local login is available only for accounts provisioned through the owner
account flow (or an explicit demo seed); Google OAuth remains the normal player
entry flow.

## Owner Onboarding Endpoints

- `POST /api/v1/owner/requests`
- `GET /api/v1/owner/requests/me`
- `GET /api/v1/admin/owner-requests`
- `POST /api/v1/admin/owner-requests/{id}/approve`
- `POST /api/v1/admin/owner-requests/{id}/reject`

## Owner Inventory Endpoints

- `GET/POST/PATCH/DELETE /api/v1/owner/court-complexes`
- `GET/POST/PATCH/DELETE /api/v1/owner/courts`
- `GET/POST/PATCH/DELETE /api/v1/owner/sessions`

Session creation and updates validate owner ownership, duration limits, skill
range, open slot capacity, and active-session time overlap before writing to
Postgres.

## Player Discovery and Booking Endpoints

- `GET /api/v1/public/discovery/sessions`
- `GET /api/v1/player/discovery/sessions`
- `GET /api/v1/player/sessions/{id}`
- `POST /api/v1/player/bookings`
- `GET /api/v1/player/bookings`
- `GET /api/v1/player/bookings/{id}`
- `POST /api/v1/player/bookings/{id}/deposit-payment`
- `POST /api/v1/payments/vnpay/webhook`
- `GET /api/v1/payments/vnpay/return`

Booking creation enforces slot limits (`solo` and `full_court`), creates payment
plan transactions (`deposit` + `remaining`), and locks session slots in one
transaction.

Discovery responses include `joined_players` from pool hosts and active
bookings so the frontend can render matchmaking participants without mock data.

## Public Platform Endpoints

- `GET /api/v1/public/platform-stats`
- `POST /api/v1/public/contact-leads`
- `POST /api/v1/public/analytics/visit`
- `GET /api/v1/public/tournaments`

`platform-stats` powers the homepage counters from live database counts.
`contact-leads` stores partner/owner leads submitted from public frontend forms.
`analytics/visit` upserts a browser visitor and a 30-minute visit session; it is
safe to call again for page views in the same session.

## Append-only User Import

When `USER_IMPORT_ENABLED=true`, container startup runs the bundled import after
Alembic. The import contains 52 supplied FPT users and 232 deterministic demo
users, then inserts only the number of non-existing profiles needed to reach
the 303-account local/demo target. It uses `ON CONFLICT DO NOTHING`, never
updates/deletes an existing `users` row, and assigns role/Elo only to rows
inserted by the current transaction.

The current append-only import uses `HE18` or `HS18` student-code prefixes. The
later reconciliation migration maps legacy demo `HE19`/`HE20` codes to `HE18`
while keeping each user UUID unchanged, so connected demo records remain
attached to the same person.

Manual verification:

```bash
docker compose exec backend-api alembic upgrade head
docker compose exec backend-api python -m app.scripts.import_users
```

## Owner Check-in Endpoints

- `GET /api/v1/owner/checkins`
- `POST /api/v1/owner/checkins`

## Owner Commerce and Player Bills Endpoints

- `GET/POST /api/v1/owner/products`
- `POST /api/v1/owner/products/{product_id}/restock`
- `GET/POST /api/v1/owner/invoices`
- `GET /api/v1/owner/invoices/{invoice_id}`
- `GET /api/v1/owner/commerce/dashboard`
- `GET /api/v1/bills`
- `GET /api/v1/bills/{invoice_id}`

Owners can sell water and shuttlecocks, replenish stock, and create a paid
invoice that may also include a court-rental line. Product updates and invoices
are scoped to the authenticated owner. Player bill endpoints scope every query
to `customer_user_id`, so a player can only read receipts assigned to that
account.

## FPT Commerce Demo Seed

Migration `0016_owner_commerce` creates the local/demo owner **CLB Badminton
FPT**; migrations `0017_reconcile_demo_data` through
`0019_normalize_shared_avatars` reconcile its receipts and normalize missing or
repeated legacy avatar URLs. The demo credential is
`clb.badminton.fpt` / `NetUp@FPT2026` and is deliberately displayed on the
local login page.

The 287 seeded receipts are explicitly marked `source=excel_seed`. Their daily
totals reconcile to the `B1` totals from all 17 sheets in
`NETUP-Doanh thu ngày.xlsx`, for a total of **17,914,000 VND**. The workbook
does not identify individual product lines, so court/water/shuttlecock lines
are a labelled, deterministic demo allocation. This seed must not be treated
as source accounting data.

## Match and Feedback Endpoints

- `POST /api/v1/player/video-assessments`
- `GET /api/v1/player/video-assessments/{assessment_id}`
- `POST /api/v1/player/matches`
- `GET /api/v1/player/matches/{match_id}`
- `POST /api/v1/player/matches/{match_id}/feedback`
- `POST /api/v1/player/matches/{match_id}/finalize`
- `GET /api/v1/player/matches/history/list`

API errors use:

```json
{
  "error": {
    "code": "database_unavailable",
    "message": "Database readiness check failed",
    "request_id": "..."
  }
}
```
