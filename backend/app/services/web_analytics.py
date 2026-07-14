from __future__ import annotations

from datetime import date
from typing import Any

from sqlalchemy import text

from app.core.errors import AppError
from app.db.session import get_engine

# Used after the append-only account import. It only fills analytics rows for
# accounts that do not have a deterministic seed visitor yet.
SEED_MISSING_USER_ANALYTICS_SQL = """
INSERT INTO public.web_visitors (
  visitor_key,
  user_id,
  first_seen_at,
  last_seen_at,
  created_at,
  updated_at
)
SELECT
  'seed-user-' || u.id::text,
  u.id,
  LEAST(u.created_at, now()),
  LEAST(now(), GREATEST(u.updated_at, u.created_at)),
  LEAST(u.created_at, now()),
  LEAST(now(), GREATEST(u.updated_at, u.created_at))
FROM public.users u
ON CONFLICT (visitor_key) DO NOTHING;

WITH seeded_users AS (
  SELECT
    u.id AS user_id,
    u.created_at AS user_created_at,
    v.id AS visitor_id,
    1 + mod(abs(hashtext(u.id::text || '-visit-count')::bigint), 5)::int AS visit_count
  FROM public.users u
  JOIN public.web_visitors v ON v.visitor_key = 'seed-user-' || u.id::text
), generated_visits AS (
  SELECT
    seeded_users.*,
    visit_number,
    LEAST(
      now(),
      GREATEST(
        user_created_at,
        now() - make_interval(
          days => mod(
            abs(hashtext(user_id::text || '-' || visit_number::text)::bigint),
            120
          )::int,
          hours => mod(visit_number * 7, 20)
        )
      )
    ) AS visited_at
  FROM seeded_users
  CROSS JOIN LATERAL generate_series(1, visit_count) AS visit_number
)
INSERT INTO public.web_visit_sessions (
  session_key,
  visitor_id,
  user_id,
  entry_path,
  last_path,
  page_view_count,
  source,
  started_at,
  last_seen_at,
  created_at,
  updated_at
)
SELECT
  'seed-visit-' || user_id::text || '-' || visit_number::text,
  visitor_id,
  user_id,
  (ARRAY[
    '/',
    '/player/discovery',
    '/player/tournaments',
    '/player/bookings',
    '/contact'
  ])[1 + mod(visit_number - 1, 5)],
  (ARRAY[
    '/player/discovery',
    '/player/tournaments',
    '/player/bookings',
    '/player/profile',
    '/contact'
  ])[1 + mod(visit_number, 5)],
  1 + mod(
    abs(hashtext(user_id::text || '-pages-' || visit_number::text)::bigint),
    6
  )::int,
  'seed',
  visited_at,
  visited_at + make_interval(mins => 3 + mod(visit_number * 11, 42)),
  visited_at,
  visited_at
FROM generated_visits
ON CONFLICT (session_key) DO NOTHING;
"""


def record_website_visit(
    *,
    visitor_key: str,
    session_key: str,
    path: str,
    user_id: str | None,
) -> dict[str, Any]:
    clean_path = path.strip() or "/"
    if not clean_path.startswith("/"):
        clean_path = f"/{clean_path}"

    with get_engine().begin() as connection:
        visitor = connection.execute(
            text(
                """
                INSERT INTO public.web_visitors (
                  visitor_key,
                  user_id,
                  first_seen_at,
                  last_seen_at
                )
                VALUES (:visitor_key, :user_id, now(), now())
                ON CONFLICT (visitor_key) DO UPDATE SET
                  user_id = COALESCE(public.web_visitors.user_id, EXCLUDED.user_id),
                  last_seen_at = GREATEST(public.web_visitors.last_seen_at, now())
                RETURNING id, first_seen_at
                """
            ),
            {"visitor_key": visitor_key, "user_id": user_id},
        ).one()

        visit_session = connection.execute(
            text(
                """
                INSERT INTO public.web_visit_sessions (
                  session_key,
                  visitor_id,
                  user_id,
                  entry_path,
                  last_path,
                  page_view_count,
                  source,
                  started_at,
                  last_seen_at
                )
                VALUES (
                  :session_key,
                  :visitor_id,
                  :user_id,
                  :path,
                  :path,
                  1,
                  'web',
                  now(),
                  now()
                )
                ON CONFLICT (session_key) DO UPDATE SET
                  user_id = COALESCE(
                    EXCLUDED.user_id,
                    public.web_visit_sessions.user_id
                  ),
                  last_path = EXCLUDED.last_path,
                  page_view_count = public.web_visit_sessions.page_view_count + 1,
                  last_seen_at = GREATEST(
                    public.web_visit_sessions.last_seen_at,
                    now()
                  )
                WHERE public.web_visit_sessions.visitor_id = EXCLUDED.visitor_id
                RETURNING id, started_at, last_seen_at, page_view_count
                """
            ),
            {
                "session_key": session_key,
                "visitor_id": str(visitor.id),
                "user_id": user_id,
                "path": clean_path[:500],
            },
        ).first()

        if visit_session is None:
            raise AppError(
                status_code=409,
                code="analytics_session_conflict",
                message="Phiên truy cập không thuộc visitor hiện tại",
            )

    return {
        "ok": True,
        "session_id": str(visit_session.id),
        "started_at": visit_session.started_at,
        "last_seen_at": visit_session.last_seen_at,
        "page_view_count": int(visit_session.page_view_count),
    }


def get_web_analytics_metrics(*, period_days: int = 30) -> dict[str, Any]:
    period_days = max(1, min(period_days, 365))
    series_days = min(period_days, 14)

    with get_engine().begin() as connection:
        summary = connection.execute(
            text(
                """
                WITH limits AS (
                  SELECT (
                    (now() AT TIME ZONE 'Asia/Bangkok')::date
                    - (:period_days - 1)
                  )::timestamp AT TIME ZONE 'Asia/Bangkok' AS period_start
                ), returning_visitors AS (
                  SELECT sessions.visitor_id
                  FROM public.web_visit_sessions sessions, limits
                  GROUP BY sessions.visitor_id, limits.period_start
                  HAVING count(*) >= 2
                     AND max(sessions.last_seen_at) >= limits.period_start
                )
                SELECT
                  (SELECT count(*)::bigint FROM public.web_visit_sessions)
                    AS total_website_visits,
                  (
                    SELECT count(*)::bigint
                    FROM public.web_visitors visitors, limits
                    WHERE visitors.first_seen_at >= limits.period_start
                  ) AS new_users,
                  (SELECT count(*)::bigint FROM public.users) AS registered_accounts,
                  (
                    SELECT count(DISTINCT sessions.user_id)::bigint
                    FROM public.web_visit_sessions sessions, limits
                    WHERE sessions.user_id IS NOT NULL
                      AND sessions.last_seen_at >= limits.period_start
                  ) AS active_users,
                  (SELECT count(*)::bigint FROM returning_visitors) AS returning_users,
                  (
                    SELECT count(*)::bigint
                    FROM public.web_visit_sessions
                    WHERE source = 'seed'
                  ) AS seeded_visits,
                  now() AS generated_at
                """
            ),
            {"period_days": period_days},
        ).one()

        daily_rows = connection.execute(
            text(
                """
                WITH days AS (
                  SELECT generate_series(
                    (now() AT TIME ZONE 'Asia/Bangkok')::date
                      - (:series_days - 1),
                    (now() AT TIME ZONE 'Asia/Bangkok')::date,
                    interval '1 day'
                  )::date AS metric_date
                ), session_days AS (
                  SELECT
                    (started_at AT TIME ZONE 'Asia/Bangkok')::date AS metric_date,
                    count(*)::int AS total_visits,
                    (
                      count(DISTINCT user_id) FILTER (WHERE user_id IS NOT NULL)
                    )::int AS active_users
                  FROM public.web_visit_sessions
                  WHERE started_at >= (
                    (now() AT TIME ZONE 'Asia/Bangkok')::date
                    - (:series_days - 1)
                  )::timestamp AT TIME ZONE 'Asia/Bangkok'
                  GROUP BY 1
                ), new_visitor_days AS (
                  SELECT
                    (first_seen_at AT TIME ZONE 'Asia/Bangkok')::date AS metric_date,
                    count(*)::int AS new_users
                  FROM public.web_visitors
                  WHERE first_seen_at >= (
                    (now() AT TIME ZONE 'Asia/Bangkok')::date
                    - (:series_days - 1)
                  )::timestamp AT TIME ZONE 'Asia/Bangkok'
                  GROUP BY 1
                ), registration_days AS (
                  SELECT
                    (created_at AT TIME ZONE 'Asia/Bangkok')::date AS metric_date,
                    count(*)::int AS registered_accounts
                  FROM public.users
                  WHERE created_at >= (
                    (now() AT TIME ZONE 'Asia/Bangkok')::date
                    - (:series_days - 1)
                  )::timestamp AT TIME ZONE 'Asia/Bangkok'
                  GROUP BY 1
                ), returning_days AS (
                  SELECT
                    (sessions.started_at AT TIME ZONE 'Asia/Bangkok')::date AS metric_date,
                    count(DISTINCT sessions.visitor_id)::int AS returning_users
                  FROM public.web_visit_sessions sessions
                  WHERE sessions.started_at >= (
                    (now() AT TIME ZONE 'Asia/Bangkok')::date
                    - (:series_days - 1)
                  )::timestamp AT TIME ZONE 'Asia/Bangkok'
                    AND EXISTS (
                      SELECT 1
                      FROM public.web_visit_sessions previous
                      WHERE previous.visitor_id = sessions.visitor_id
                        AND previous.started_at < sessions.started_at
                    )
                  GROUP BY 1
                )
                SELECT
                  days.metric_date,
                  COALESCE(session_days.total_visits, 0)::int AS total_visits,
                  COALESCE(new_visitor_days.new_users, 0)::int AS new_users,
                  COALESCE(registration_days.registered_accounts, 0)::int
                    AS registered_accounts,
                  COALESCE(session_days.active_users, 0)::int AS active_users,
                  COALESCE(returning_days.returning_users, 0)::int AS returning_users
                FROM days
                LEFT JOIN session_days USING (metric_date)
                LEFT JOIN new_visitor_days USING (metric_date)
                LEFT JOIN registration_days USING (metric_date)
                LEFT JOIN returning_days USING (metric_date)
                ORDER BY days.metric_date
                """
            ),
            {"series_days": series_days},
        ).all()

    return {
        "total_website_visits": int(summary.total_website_visits),
        "new_users": int(summary.new_users),
        "registered_accounts": int(summary.registered_accounts),
        "active_users": int(summary.active_users),
        "returning_users": int(summary.returning_users),
        "seeded_visits": int(summary.seeded_visits),
        "period_days": period_days,
        "generated_at": summary.generated_at,
        "daily": [
            {
                "date": (
                    row.metric_date
                    if isinstance(row.metric_date, date)
                    else date.fromisoformat(str(row.metric_date))
                ),
                "total_visits": int(row.total_visits),
                "new_users": int(row.new_users),
                "registered_accounts": int(row.registered_accounts),
                "active_users": int(row.active_users),
                "returning_users": int(row.returning_users),
            }
            for row in daily_rows
        ],
    }
