"""distribute user creation dates for launch analytics

Revision ID: 0021_distribute_dates
Revises: 0020_retire_demo_seed_data
Create Date: 2026-07-14
"""

from __future__ import annotations

from alembic import op

revision = "0021_distribute_dates"
down_revision = "0020_retire_demo_seed_data"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        r"""
        WITH ranked_users AS (
          SELECT
            user_account.id,
            row_number() OVER (ORDER BY hashtext(user_account.id::text)) AS position,
            count(*) OVER () AS total
          FROM public.users user_account
          LEFT JOIN public.admin_accounts admin_account
            ON admin_account.user_id = user_account.id
          WHERE user_account.is_active = true
            AND admin_account.id IS NULL
        ), schedule AS (
          SELECT
            id,
            CASE
              -- 20% during the two weeks before the public campaign.
              WHEN position <= ceil(total * 0.20) THEN
                14 + mod(position - 1, 16)::int
              -- 80% during the most recent 14 days.
              ELSE mod(position - ceil(total * 0.20) - 1, 14)::int
            END AS days_ago,
            mod(abs(hashtext(id::text || '-created-at')), 10)::int AS hour_offset
          FROM ranked_users
        )
        UPDATE public.users user_account
        SET created_at = (
          (
            (now() AT TIME ZONE 'Asia/Bangkok')::date - schedule.days_ago
          )::timestamp
          + make_interval(hours => 9 + schedule.hour_offset)
        ) AT TIME ZONE 'Asia/Bangkok'
        FROM schedule
        WHERE user_account.id = schedule.id;
        """
    )


def downgrade() -> None:
    # The original creation timestamps are not recoverable after distribution.
    pass
