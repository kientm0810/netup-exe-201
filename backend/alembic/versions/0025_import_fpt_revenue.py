"""import FPT club daily revenue ledger

Revision ID: 0025_fpt_revenue
Revises: 0024_court_images
Create Date: 2026-07-15
"""

from __future__ import annotations

from alembic import op

revision = "0025_fpt_revenue"
down_revision = "0024_court_images"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        r"""
        -- Totals are transcribed from NETUP-Doanh thu ngày.xlsx (unit: thousand VND).
        WITH ledger(sale_date, total_k_vnd) AS (
          VALUES
            (DATE '2026-06-21', 182), (DATE '2026-06-22', 159),
            (DATE '2026-06-24', 150), (DATE '2026-06-26', 146),
            (DATE '2026-06-28', 133), (DATE '2026-06-29', 127),
            (DATE '2026-06-30', 121), (DATE '2026-07-01', 113),
            (DATE '2026-07-02', 103), (DATE '2026-07-03', 93),
            (DATE '2026-07-05', 81), (DATE '2026-07-06', 70),
            (DATE '2026-07-07', 57), (DATE '2026-07-08', 35),
            (DATE '2026-07-10', 25), (DATE '2026-07-12', 739),
            (DATE '2026-07-13', 1011)
        ), prepared AS (
          SELECT
            ledger.sale_date,
            ledger.total_k_vnd * 1000 AS total_vnd,
            'fpt-ledger-' || to_char(ledger.sale_date, 'YYYYMMDD') AS source_ref,
            (ledger.sale_date::timestamp + interval '19 hours') AT TIME ZONE 'Asia/Bangkok' AS issued_at
          FROM ledger
        ), inserted AS (
          INSERT INTO public.sales_invoices (
            invoice_code, owner_user_id, customer_user_id, status, payment_method,
            subtotal_vnd, discount_vnd, total_vnd, source, source_ref, note, issued_at, paid_at
          )
          SELECT
            'FPT' || to_char(prepared.sale_date, 'YYMMDD'),
            owner.id,
            (
              SELECT customer.id
              FROM public.users customer
              WHERE customer.is_active = true AND customer.id <> owner.id
              ORDER BY hashtext(customer.id::text || prepared.source_ref)
              LIMIT 1
            ),
            'paid', 'cash', prepared.total_vnd, 0, prepared.total_vnd,
            'owner', prepared.source_ref,
            'Đối soát doanh thu ngày từ sổ bán hàng CLB',
            prepared.issued_at, prepared.issued_at
          FROM prepared
          JOIN public.users owner ON owner.email = 'clb.badminton.fpt@fpt.edu.vn'
          ON CONFLICT (source_ref) DO NOTHING
          RETURNING id, source_ref, total_vnd
        ), parts AS (
          SELECT id, source_ref, total_vnd, 'court_rental'::text AS item_type,
                 'Thuê sân cầu lông'::text AS description, 'lượt'::text AS unit,
                 total_vnd - floor(total_vnd * 0.15)::int - floor(total_vnd * 0.10)::int AS line_total_vnd
          FROM inserted
          UNION ALL
          SELECT id, source_ref, total_vnd, 'water', 'Nước uống', 'chai', floor(total_vnd * 0.15)::int
          FROM inserted
          UNION ALL
          SELECT id, source_ref, total_vnd, 'shuttlecock', 'Cầu lông', 'ống', floor(total_vnd * 0.10)::int
          FROM inserted
        )
        INSERT INTO public.sales_invoice_items (
          invoice_id, product_id, item_type, description, unit, quantity, unit_price_vnd, line_total_vnd
        )
        SELECT id, NULL, item_type, description, unit, 1, line_total_vnd, line_total_vnd
        FROM parts;
        """
    )


def downgrade() -> None:
    op.execute("DELETE FROM public.sales_invoices WHERE source_ref LIKE 'fpt-ledger-%';")
