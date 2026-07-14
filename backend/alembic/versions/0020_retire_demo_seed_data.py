"""retire demo credentials and synthetic production data

Revision ID: 0020_retire_demo_seed_data
Revises: 0019_normalize_shared_avatars
Create Date: 2026-07-14
"""

from __future__ import annotations

from alembic import op

revision = "0020_retire_demo_seed_data"
down_revision = "0019_normalize_shared_avatars"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        r"""
        -- Invoice rows labelled excel_seed and sessions labelled seed were
        -- generated solely for the earlier demo. They are not production data.
        DELETE FROM public.sales_invoices WHERE source = 'excel_seed';
        DELETE FROM public.inventory_movements
        WHERE note IN ('Bán theo dữ liệu Excel', 'Tồn kho đầu kỳ trước dữ liệu Excel');
        DELETE FROM public.web_visit_sessions WHERE source = 'seed';
        DELETE FROM public.web_visitors visitor
        WHERE visitor.visitor_key LIKE 'seed-%'
          AND NOT EXISTS (
            SELECT 1
            FROM public.web_visit_sessions session
            WHERE session.visitor_id = visitor.id
          );

        -- Never retain a public, fixed password for the former FPT demo owner.
        DELETE FROM public.user_password_credentials credential
        USING public.users user_account
        WHERE credential.user_id = user_account.id
          AND user_account.email = 'clb.badminton.fpt@fpt.edu.vn'
          AND credential.username = 'clb.badminton.fpt';

        UPDATE public.user_role_assignments role
        SET revoked_at = COALESCE(role.revoked_at, now()),
            reason = 'retired demo owner'
        FROM public.users user_account
        WHERE role.user_id = user_account.id
          AND user_account.email = 'clb.badminton.fpt@fpt.edu.vn'
          AND role.reason = 'FPT badminton club demo owner';

        UPDATE public.users user_account
        SET is_active = false, updated_at = now()
        WHERE user_account.email = 'clb.badminton.fpt@fpt.edu.vn'
          AND NOT EXISTS (
            SELECT 1
            FROM public.user_password_credentials credential
            WHERE credential.user_id = user_account.id
          );
        """
    )


def downgrade() -> None:
    # Demo transactions and the public credential are intentionally not restored.
    pass
