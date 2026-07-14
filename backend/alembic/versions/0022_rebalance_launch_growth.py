"""rebalance launch-period account growth

Revision ID: 0022_rebalance_growth
Revises: 0021_distribute_dates
Create Date: 2026-07-15
"""

from __future__ import annotations

from alembic import op

revision = "0022_rebalance_growth"
down_revision = "0021_distribute_dates"
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
        ), distribution AS (
          SELECT
            id,
            position,
            ceil(total * 0.20)::int AS pre_launch_count,
            (total - ceil(total * 0.20))::int AS recent_count,
            ceil((total - ceil(total * 0.20)) * 0.60)::int AS campaign_count
          FROM ranked_users
        ), schedule AS (
          SELECT
            id,
            CASE
              -- 20% of accounts: gradual pre-launch growth (30–15 days ago).
              WHEN position <= pre_launch_count THEN 14 + mod(position - 1, 16)::int
              -- 60% of recent accounts: campaign peak from 14–10 days ago.
              WHEN position - pre_launch_count <= campaign_count THEN
                10 + mod(position - pre_launch_count - 1, 4)::int
              -- Remaining recent accounts: steady post-campaign growth.
              ELSE mod(position - pre_launch_count - campaign_count - 1, 10)::int
            END AS days_ago,
            mod(abs(hashtext(id::text || '-growth-hour')), 10)::int AS hour_offset
          FROM distribution
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
    pass
