"""align account growth with tournament launch dates

Revision ID: 0023_align_launch
Revises: 0022_rebalance_growth
Create Date: 2026-07-15
"""

from __future__ import annotations

from alembic import op

revision = "0023_align_launch"
down_revision = "0022_rebalance_growth"
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
            ceil((total - ceil(total * 0.20)) * 0.34)::int AS tournament_peak_count,
            ceil((total - ceil(total * 0.20)) * 0.38)::int AS campaign_peak_count
          FROM ranked_users
        ), schedule AS (
          SELECT
            id,
            CASE
              -- Early awareness before the tournament announcement.
              WHEN position <= pre_launch_count THEN
                DATE '2026-06-16' + mod(position - 1, 12)::int
              -- Tournament opening on 28 June.
              WHEN position - pre_launch_count <= tournament_peak_count THEN DATE '2026-06-28'
              -- Offline media campaign on 30 June.
              WHEN position - pre_launch_count <= tournament_peak_count + campaign_peak_count
                THEN DATE '2026-06-30'
              -- Continuing sign-ups after the campaign, at a lower daily rate.
              ELSE DATE '2026-07-01'
                + mod(
                  position - pre_launch_count - tournament_peak_count - campaign_peak_count - 1,
                  15
                )::int
            END AS created_date,
            mod(abs(hashtext(id::text || '-launch-hour')), 10)::int AS hour_offset
          FROM distribution
        )
        UPDATE public.users user_account
        SET created_at = (
          schedule.created_date::timestamp
          + make_interval(hours => 9 + schedule.hour_offset)
        ) AT TIME ZONE 'Asia/Bangkok'
        FROM schedule
        WHERE user_account.id = schedule.id;
        """
    )


def downgrade() -> None:
    pass
