"""assign distinct images to existing courts

Revision ID: 0024_court_images
Revises: 0023_align_launch
Create Date: 2026-07-15
"""

from __future__ import annotations

from alembic import op

revision = "0024_court_images"
down_revision = "0023_align_launch"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        r"""
        UPDATE public.courts AS court
        SET image_url = images.image_url,
            updated_at = now()
        FROM (
          VALUES
            ('79f9cff1-4a0f-49bb-abd6-3f7374b96bdc'::uuid, '/courts/badminton-venue-01.png'),
            ('94140437-d2a9-4f85-9856-3872e2699555'::uuid, '/courts/badminton-venue-02.png'),
            ('6dfc86c1-8c56-4841-af48-4d02dbb49e29'::uuid, '/courts/badminton-venue-03.png'),
            ('00000000-0000-0000-0000-000000000921'::uuid, '/courts/badminton1.jpg'),
            ('00000000-0000-0000-0000-000000000922'::uuid, '/courts/tennis1.jpg'),
            ('00000000-0000-0000-0000-000000000923'::uuid, '/courts/football1.jpeg'),
            ('00000000-0000-0000-0000-000000001611'::uuid, '/courts/backgroundchusan.jpg'),
            ('00000000-0000-0000-0000-000000001612'::uuid, '/courts/anhnen1.png'),
            ('00000000-0000-0000-0000-000000001613'::uuid, '/courts/anhnen2.png'),
            ('00000000-0000-0000-0000-000000001614'::uuid, '/courts/anhnen3.png')
        ) AS images(id, image_url)
        WHERE court.id = images.id;
        """
    )


def downgrade() -> None:
    pass
