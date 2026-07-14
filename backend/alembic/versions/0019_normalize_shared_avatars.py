"""replace any shared Google avatar URL with name initials

Revision ID: 0019_normalize_shared_avatars
Revises: 0018_fill_initial_avatars
Create Date: 2026-07-14
"""

from __future__ import annotations

from alembic import op

revision = "0019_normalize_shared_avatars"
down_revision = "0018_fill_initial_avatars"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        r"""
        -- A Google URL shared by multiple profiles is a copied demo avatar,
        -- not an individual Google profile. Replace only those duplicates;
        -- unique Google avatars remain untouched.
        WITH repeated_google_avatars AS (
          SELECT avatar_url
          FROM public.users
          WHERE avatar_url LIKE 'https://lh3.googleusercontent.com/%'
          GROUP BY avatar_url
          HAVING count(*) > 1
        )
        UPDATE public.users AS user_account
        SET
          avatar_url =
            'https://ui-avatars.com/api/?name='
            || replace(trim(user_account.full_name), ' ', '+')
            || '&background=4285F4&color=fff&size=96&bold=true&rounded=true&format=png&length=2',
          updated_at = now()
        FROM repeated_google_avatars repeated
        WHERE user_account.avatar_url = repeated.avatar_url;
        """
    )


def downgrade() -> None:
    # The original duplicate URL is intentionally not restored.
    pass
