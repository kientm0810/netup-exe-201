"""fill initial avatars where a profile has none

Revision ID: 0018_fill_initial_avatars
Revises: 0017_reconcile_demo_data
Create Date: 2026-07-14
"""

from __future__ import annotations

from alembic import op

revision = "0018_fill_initial_avatars"
down_revision = "0017_reconcile_demo_data"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        r"""
        UPDATE public.users
        SET
          avatar_url =
            'https://ui-avatars.com/api/?name='
            || replace(trim(full_name), ' ', '+')
            || '&background=4285F4&color=fff&size=96&bold=true&rounded=true&format=png&length=2',
          updated_at = now()
        WHERE avatar_url IS NULL OR btrim(avatar_url) = '';
        """
    )


def downgrade() -> None:
    # The old null values did not carry recoverable image data.
    pass
