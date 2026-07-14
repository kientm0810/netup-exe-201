"""website visitor and visit-session analytics

Revision ID: 0015_web_analytics
Revises: 0014_court_operating_hours
Create Date: 2026-07-14
"""

from __future__ import annotations

from alembic import op

revision = "0015_web_analytics"
down_revision = "0014_court_operating_hours"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS public.web_visitors (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          visitor_key varchar(80) NOT NULL UNIQUE,
          user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
          first_seen_at timestamptz NOT NULL DEFAULT now(),
          last_seen_at timestamptz NOT NULL DEFAULT now(),
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now(),
          CHECK (length(visitor_key) BETWEEN 8 AND 80),
          CHECK (last_seen_at >= first_seen_at)
        );

        CREATE TABLE IF NOT EXISTS public.web_visit_sessions (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          session_key varchar(80) NOT NULL UNIQUE,
          visitor_id uuid NOT NULL REFERENCES public.web_visitors(id) ON DELETE CASCADE,
          user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
          entry_path varchar(500) NOT NULL,
          last_path varchar(500) NOT NULL,
          page_view_count integer NOT NULL DEFAULT 1 CHECK (page_view_count >= 1),
          source varchar(20) NOT NULL DEFAULT 'web' CHECK (source IN ('web', 'seed')),
          started_at timestamptz NOT NULL DEFAULT now(),
          last_seen_at timestamptz NOT NULL DEFAULT now(),
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now(),
          CHECK (length(session_key) BETWEEN 8 AND 80),
          CHECK (length(entry_path) BETWEEN 1 AND 500),
          CHECK (length(last_path) BETWEEN 1 AND 500),
          CHECK (last_seen_at >= started_at)
        );

        DROP TRIGGER IF EXISTS trg_web_visitors_updated_at ON public.web_visitors;
        CREATE TRIGGER trg_web_visitors_updated_at
        BEFORE UPDATE ON public.web_visitors
        FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

        DROP TRIGGER IF EXISTS trg_web_visit_sessions_updated_at
        ON public.web_visit_sessions;
        CREATE TRIGGER trg_web_visit_sessions_updated_at
        BEFORE UPDATE ON public.web_visit_sessions
        FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

        CREATE INDEX IF NOT EXISTS idx_web_visitors_user
        ON public.web_visitors(user_id)
        WHERE user_id IS NOT NULL;

        CREATE INDEX IF NOT EXISTS idx_web_visitors_first_seen
        ON public.web_visitors(first_seen_at DESC);

        CREATE INDEX IF NOT EXISTS idx_web_visit_sessions_started
        ON public.web_visit_sessions(started_at DESC);

        CREATE INDEX IF NOT EXISTS idx_web_visit_sessions_visitor_started
        ON public.web_visit_sessions(visitor_id, started_at DESC);

        CREATE INDEX IF NOT EXISTS idx_web_visit_sessions_user_seen
        ON public.web_visit_sessions(user_id, last_seen_at DESC)
        WHERE user_id IS NOT NULL;

        -- Seed a deterministic history from accounts that predate analytics tracking.
        -- Every account gets 1..5 visits, so the initial dashboard is proportional
        -- to production data instead of relying on unrelated hard-coded totals.
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
            1 + mod(abs(hashtext(u.id::text || '-visit-count')::bigint), 5)::int
              AS visit_count
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
    )


def downgrade() -> None:
    op.execute(
        """
        DROP TRIGGER IF EXISTS trg_web_visit_sessions_updated_at
        ON public.web_visit_sessions;
        DROP TRIGGER IF EXISTS trg_web_visitors_updated_at ON public.web_visitors;
        DROP TABLE IF EXISTS public.web_visit_sessions;
        DROP TABLE IF EXISTS public.web_visitors;
        """
    )
