"""owner local accounts, retail invoices, and richer demo analytics

Revision ID: 0016_owner_commerce
Revises: 0015_web_analytics
Create Date: 2026-07-14
"""

from __future__ import annotations

from alembic import op

revision = "0016_owner_commerce"
down_revision = "0015_web_analytics"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        r"""
        CREATE TABLE IF NOT EXISTS public.user_password_credentials (
          user_id uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
          username citext NOT NULL UNIQUE,
          password_hash text NOT NULL,
          must_change_password boolean NOT NULL DEFAULT false,
          last_login_at timestamptz,
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now()
        );

        CREATE TABLE IF NOT EXISTS public.user_login_audits (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
          username_attempt citext NOT NULL,
          success boolean NOT NULL,
          ip text,
          user_agent text,
          created_at timestamptz NOT NULL DEFAULT now()
        );

        CREATE TABLE IF NOT EXISTS public.owner_products (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          owner_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
          sku text NOT NULL,
          name text NOT NULL,
          category text NOT NULL CHECK (category IN ('water', 'shuttlecock')),
          unit text NOT NULL,
          sale_price_vnd integer NOT NULL CHECK (sale_price_vnd >= 0),
          stock_quantity numeric(12,2) NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0),
          is_active boolean NOT NULL DEFAULT true,
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now(),
          UNIQUE (owner_user_id, sku)
        );

        CREATE TABLE IF NOT EXISTS public.sales_invoices (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          invoice_code text NOT NULL UNIQUE,
          owner_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
          customer_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
          booking_id uuid REFERENCES public.bookings(id) ON DELETE SET NULL,
          status text NOT NULL DEFAULT 'paid' CHECK (status IN ('draft', 'paid', 'void')),
          payment_method text NOT NULL DEFAULT 'cash'
            CHECK (payment_method IN ('cash', 'bank_transfer')),
          subtotal_vnd integer NOT NULL CHECK (subtotal_vnd >= 0),
          discount_vnd integer NOT NULL DEFAULT 0 CHECK (discount_vnd >= 0),
          total_vnd integer NOT NULL CHECK (total_vnd >= 0),
          source text NOT NULL DEFAULT 'owner' CHECK (source IN ('owner', 'excel_seed')),
          source_ref text UNIQUE,
          note text,
          issued_at timestamptz NOT NULL DEFAULT now(),
          paid_at timestamptz,
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now(),
          CHECK (discount_vnd <= subtotal_vnd),
          CHECK (total_vnd = subtotal_vnd - discount_vnd),
          CHECK ((status = 'paid' AND paid_at IS NOT NULL) OR status <> 'paid')
        );

        CREATE TABLE IF NOT EXISTS public.sales_invoice_items (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          invoice_id uuid NOT NULL REFERENCES public.sales_invoices(id) ON DELETE CASCADE,
          product_id uuid REFERENCES public.owner_products(id) ON DELETE SET NULL,
          item_type text NOT NULL
            CHECK (item_type IN ('court_rental', 'water', 'shuttlecock')),
          description text NOT NULL,
          unit text NOT NULL,
          quantity numeric(12,2) NOT NULL CHECK (quantity > 0),
          unit_price_vnd integer NOT NULL CHECK (unit_price_vnd >= 0),
          line_total_vnd integer NOT NULL CHECK (line_total_vnd >= 0),
          created_at timestamptz NOT NULL DEFAULT now()
        );

        CREATE TABLE IF NOT EXISTS public.inventory_movements (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          product_id uuid NOT NULL REFERENCES public.owner_products(id) ON DELETE CASCADE,
          invoice_item_id uuid REFERENCES public.sales_invoice_items(id) ON DELETE SET NULL,
          movement_type text NOT NULL CHECK (movement_type IN ('sale', 'restock', 'adjustment')),
          quantity_delta numeric(12,2) NOT NULL CHECK (quantity_delta <> 0),
          note text,
          created_by_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
          created_at timestamptz NOT NULL DEFAULT now()
        );

        DROP TRIGGER IF EXISTS trg_user_password_credentials_updated_at
        ON public.user_password_credentials;
        CREATE TRIGGER trg_user_password_credentials_updated_at
        BEFORE UPDATE ON public.user_password_credentials
        FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

        DROP TRIGGER IF EXISTS trg_owner_products_updated_at ON public.owner_products;
        CREATE TRIGGER trg_owner_products_updated_at
        BEFORE UPDATE ON public.owner_products
        FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

        DROP TRIGGER IF EXISTS trg_sales_invoices_updated_at ON public.sales_invoices;
        CREATE TRIGGER trg_sales_invoices_updated_at
        BEFORE UPDATE ON public.sales_invoices
        FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

        CREATE INDEX IF NOT EXISTS idx_user_login_audits_attempt_created
        ON public.user_login_audits(username_attempt, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_owner_products_owner_active
        ON public.owner_products(owner_user_id, is_active, category);
        CREATE INDEX IF NOT EXISTS idx_sales_invoices_owner_issued
        ON public.sales_invoices(owner_user_id, issued_at DESC);
        CREATE INDEX IF NOT EXISTS idx_sales_invoices_customer_issued
        ON public.sales_invoices(customer_user_id, issued_at DESC)
        WHERE customer_user_id IS NOT NULL;
        CREATE INDEX IF NOT EXISTS idx_sales_invoice_items_invoice
        ON public.sales_invoice_items(invoice_id);
        CREATE INDEX IF NOT EXISTS idx_inventory_movements_product_created
        ON public.inventory_movements(product_id, created_at DESC);

        -- This is an explicitly labelled demo account requested for the FPT club.
        -- The PBKDF2 hash is for the documented demo password NetUp@FPT2026.
        INSERT INTO public.users (
          id, email, full_name, phone, city, district, is_active
        )
        VALUES (
          '00000000-0000-0000-0000-000000001601',
          'clb.badminton.fpt@fpt.edu.vn',
          'CLB Badminton FPT',
          '0988002026',
          'Hà Nội',
          'Thạch Thất',
          true
        )
        ON CONFLICT (email) DO UPDATE SET
          full_name = EXCLUDED.full_name,
          phone = COALESCE(public.users.phone, EXCLUDED.phone),
          city = COALESCE(public.users.city, EXCLUDED.city),
          district = COALESCE(public.users.district, EXCLUDED.district),
          is_active = true,
          updated_at = now();

        INSERT INTO public.user_role_assignments (user_id, role, reason)
        SELECT id, 'owner', 'FPT badminton club demo owner'
        FROM public.users
        WHERE email = 'clb.badminton.fpt@fpt.edu.vn'
        ON CONFLICT DO NOTHING;

        INSERT INTO public.user_password_credentials (
          user_id, username, password_hash, must_change_password
        )
        SELECT
          id,
          'clb.badminton.fpt',
          'pbkdf2_sha256$310000$MZmVt1hakU7sSVS2zmmF2w$-Bfqe4Gy3s5rYEGSDHU9GEfxAu0veDJnQ2jZ_ALzZmg',
          false
        FROM public.users
        WHERE email = 'clb.badminton.fpt@fpt.edu.vn'
        ON CONFLICT (user_id) DO UPDATE SET
          username = EXCLUDED.username,
          password_hash = EXCLUDED.password_hash,
          must_change_password = EXCLUDED.must_change_password,
          updated_at = now();

        INSERT INTO public.owner_post_quotas (
          owner_user_id, rental_post_limit, slot_post_limit
        )
        SELECT id, 100, 100
        FROM public.users
        WHERE email = 'clb.badminton.fpt@fpt.edu.vn'
        ON CONFLICT (owner_user_id) DO NOTHING;

        INSERT INTO public.owner_service_requests (
          user_id,
          business_name,
          contact_phone,
          facility_overview,
          status,
          submitted_at,
          reviewed_at,
          review_note
        )
        SELECT
          id,
          'CLB Badminton FPT',
          '0988002026',
          'Câu lạc bộ cầu lông FPT Hòa Lạc',
          'approved',
          now(),
          now(),
          'Tài khoản demo được khởi tạo từ migration owner commerce'
        FROM public.users u
        WHERE u.email = 'clb.badminton.fpt@fpt.edu.vn'
          AND NOT EXISTS (
            SELECT 1 FROM public.owner_service_requests r
            WHERE r.user_id = u.id AND r.status = 'approved'
          );

        INSERT INTO public.court_complexes (
          id, owner_user_id, name, district, address, latitude, longitude
        )
        SELECT
          '00000000-0000-0000-0000-000000001610',
          id,
          'CLB Badminton FPT',
          'Thạch Thất',
          'Khu Giáo dục và Đào tạo, Khu Công nghệ cao Hòa Lạc, Hà Nội',
          21.0134,
          105.5254
        FROM public.users
        WHERE email = 'clb.badminton.fpt@fpt.edu.vn'
        ON CONFLICT (owner_user_id, name) DO NOTHING;

        INSERT INTO public.courts (
          id,
          complex_id,
          owner_user_id,
          name,
          sub_court_name,
          sport,
          status,
          rating,
          amenities,
          base_price_vnd,
          max_rental_duration_minutes,
          min_rental_duration_minutes,
          open_time,
          close_time
        )
        SELECT
          seed.id::uuid,
          complex.id,
          complex.owner_user_id,
          'Sân cầu lông ' || seed.number,
          'Sân ' || seed.number,
          'Badminton',
          'active',
          4.8,
          ARRAY['Wifi', 'Nước uống', 'Bãi đỗ xe', 'Phòng thay đồ'],
          120000,
          180,
          60,
          '06:00:00',
          '22:30:00'
        FROM public.court_complexes complex
        CROSS JOIN (VALUES
          ('00000000-0000-0000-0000-000000001611', 1),
          ('00000000-0000-0000-0000-000000001612', 2),
          ('00000000-0000-0000-0000-000000001613', 3),
          ('00000000-0000-0000-0000-000000001614', 4)
        ) AS seed(id, number)
        WHERE complex.name = 'CLB Badminton FPT'
          AND complex.owner_user_id = (
            SELECT id FROM public.users
            WHERE email = 'clb.badminton.fpt@fpt.edu.vn'
          )
        ON CONFLICT (complex_id, sub_court_name) DO NOTHING;

        INSERT INTO public.owner_products (
          id,
          owner_user_id,
          sku,
          name,
          category,
          unit,
          sale_price_vnd,
          stock_quantity,
          is_active
        )
        SELECT
          seed.id::uuid,
          owner.id,
          seed.sku,
          seed.name,
          seed.category,
          seed.unit,
          seed.price,
          seed.stock,
          true
        FROM public.users owner
        CROSS JOIN (VALUES
          (
            '00000000-0000-0000-0000-000000001621',
            'NUOC-SUOI-01',
            'Nước suối Aquafina',
            'water',
            'chai',
            10000,
            500::numeric
          ),
          (
            '00000000-0000-0000-0000-000000001622',
            'CAU-HY-S70',
            'Cầu lông Hải Yến S70',
            'shuttlecock',
            'quả',
            30000,
            300::numeric
          )
        ) AS seed(id, sku, name, category, unit, price, stock)
        WHERE owner.email = 'clb.badminton.fpt@fpt.edu.vn'
        ON CONFLICT (owner_user_id, sku) DO UPDATE SET
          name = EXCLUDED.name,
          category = EXCLUDED.category,
          unit = EXCLUDED.unit,
          sale_price_vnd = EXCLUDED.sale_price_vnd,
          is_active = true,
          updated_at = now();

        -- Daily totals come from cells B1 of NETUP-Doanh thu ngày.xlsx. The
        -- workbook has no product category, so every daily total is divided
        -- into four plausible bills, then into rental/water/shuttle lines.
        WITH daily(sale_date, total_vnd) AS (
          VALUES
            (DATE '2026-06-21', 1730000),
            (DATE '2026-06-22', 1765000),
            (DATE '2026-06-24', 1580000),
            (DATE '2026-06-26', 544000),
            (DATE '2026-06-28', 1087000),
            (DATE '2026-06-29', 364000),
            (DATE '2026-06-30', 883000),
            (DATE '2026-07-01', 535000),
            (DATE '2026-07-02', 972000),
            (DATE '2026-07-03', 1500000),
            (DATE '2026-07-05', 1139000),
            (DATE '2026-07-06', 550000),
            (DATE '2026-07-07', 1424000),
            (DATE '2026-07-08', 1529000),
            (DATE '2026-07-10', 562000),
            (DATE '2026-07-12', 739000),
            (DATE '2026-07-13', 1011000)
        ), bases AS (
          SELECT
            sale_date,
            total_vnd,
            floor(total_vnd * 0.19 / 1000)::int * 1000 AS amount_1,
            floor(total_vnd * 0.23 / 1000)::int * 1000 AS amount_2,
            floor(total_vnd * 0.27 / 1000)::int * 1000 AS amount_3
          FROM daily
        ), bills AS (
          SELECT
            base.sale_date,
            split.bill_number,
            split.amount_vnd,
            1 + mod(EXTRACT(day FROM base.sale_date)::int + split.bill_number, 3)
              AS water_quantity,
            1 + mod(EXTRACT(day FROM base.sale_date)::int + split.bill_number, 2)
              AS shuttle_quantity
          FROM bases base
          CROSS JOIN LATERAL (VALUES
            (1, base.amount_1),
            (2, base.amount_2),
            (3, base.amount_3),
            (4, base.total_vnd - base.amount_1 - base.amount_2 - base.amount_3)
          ) AS split(bill_number, amount_vnd)
        ), owner_account AS (
          SELECT id FROM public.users
          WHERE email = 'clb.badminton.fpt@fpt.edu.vn'
        )
        INSERT INTO public.sales_invoices (
          invoice_code,
          owner_user_id,
          customer_user_id,
          status,
          payment_method,
          subtotal_vnd,
          discount_vnd,
          total_vnd,
          source,
          source_ref,
          note,
          issued_at,
          paid_at
        )
        SELECT
          'FPT-' || to_char(bill.sale_date, 'YYYYMMDD') || '-'
            || lpad(bill.bill_number::text, 2, '0'),
          owner_account.id,
          customer.id,
          'paid',
          CASE WHEN mod(bill.bill_number, 2) = 0 THEN 'bank_transfer' ELSE 'cash' END,
          bill.amount_vnd,
          0,
          bill.amount_vnd,
          'excel_seed',
          'excel-daily:' || bill.sale_date::text || ':' || bill.bill_number::text,
          'Dữ liệu demo phân bổ từ tổng ngày trong NETUP-Doanh thu ngày.xlsx',
          (bill.sale_date::timestamp + time '18:30') AT TIME ZONE 'Asia/Bangkok'
            + make_interval(mins => bill.bill_number * 35),
          (bill.sale_date::timestamp + time '18:30') AT TIME ZONE 'Asia/Bangkok'
            + make_interval(mins => bill.bill_number * 35)
        FROM bills bill
        CROSS JOIN owner_account
        LEFT JOIN LATERAL (
          SELECT candidate.id
          FROM public.users candidate
          WHERE candidate.is_active = true
            AND candidate.id <> owner_account.id
          ORDER BY md5(
            candidate.id::text || bill.sale_date::text || bill.bill_number::text
          )
          LIMIT 1
        ) customer ON true
        ON CONFLICT (source_ref) DO NOTHING;

        WITH daily(sale_date, total_vnd) AS (
          VALUES
            (DATE '2026-06-21', 1730000), (DATE '2026-06-22', 1765000),
            (DATE '2026-06-24', 1580000), (DATE '2026-06-26', 544000),
            (DATE '2026-06-28', 1087000), (DATE '2026-06-29', 364000),
            (DATE '2026-06-30', 883000), (DATE '2026-07-01', 535000),
            (DATE '2026-07-02', 972000), (DATE '2026-07-03', 1500000),
            (DATE '2026-07-05', 1139000), (DATE '2026-07-06', 550000),
            (DATE '2026-07-07', 1424000), (DATE '2026-07-08', 1529000),
            (DATE '2026-07-10', 562000), (DATE '2026-07-12', 739000),
            (DATE '2026-07-13', 1011000)
        ), bases AS (
          SELECT
            sale_date,
            total_vnd,
            floor(total_vnd * 0.19 / 1000)::int * 1000 AS amount_1,
            floor(total_vnd * 0.23 / 1000)::int * 1000 AS amount_2,
            floor(total_vnd * 0.27 / 1000)::int * 1000 AS amount_3
          FROM daily
        ), bills AS (
          SELECT
            base.sale_date,
            split.bill_number,
            split.amount_vnd,
            1 + mod(EXTRACT(day FROM base.sale_date)::int + split.bill_number, 3)
              AS water_quantity,
            1 + mod(EXTRACT(day FROM base.sale_date)::int + split.bill_number, 2)
              AS shuttle_quantity
          FROM bases base
          CROSS JOIN LATERAL (VALUES
            (1, base.amount_1), (2, base.amount_2), (3, base.amount_3),
            (4, base.total_vnd - base.amount_1 - base.amount_2 - base.amount_3)
          ) AS split(bill_number, amount_vnd)
        ), seeded_invoices AS (
          SELECT
            invoice.id AS invoice_id,
            invoice.owner_user_id,
            bill.*
          FROM bills bill
          JOIN public.sales_invoices invoice
            ON invoice.source_ref =
              'excel-daily:' || bill.sale_date::text || ':' || bill.bill_number::text
        ), item_rows AS (
          SELECT
            seeded.invoice_id,
            NULL::uuid AS product_id,
            'court_rental'::text AS item_type,
            'Thuê sân cầu lông'::text AS description,
            'lượt'::text AS unit,
            1::numeric AS quantity,
            (
              seeded.amount_vnd
              - seeded.water_quantity * 10000
              - seeded.shuttle_quantity * 30000
            )::int AS unit_price_vnd,
            (
              seeded.amount_vnd
              - seeded.water_quantity * 10000
              - seeded.shuttle_quantity * 30000
            )::int AS line_total_vnd
          FROM seeded_invoices seeded
          UNION ALL
          SELECT
            seeded.invoice_id,
            product.id,
            'water',
            product.name,
            product.unit,
            seeded.water_quantity::numeric,
            10000,
            seeded.water_quantity * 10000
          FROM seeded_invoices seeded
          JOIN public.owner_products product
            ON product.owner_user_id = seeded.owner_user_id
           AND product.sku = 'NUOC-SUOI-01'
          UNION ALL
          SELECT
            seeded.invoice_id,
            product.id,
            'shuttlecock',
            product.name,
            product.unit,
            seeded.shuttle_quantity::numeric,
            30000,
            seeded.shuttle_quantity * 30000
          FROM seeded_invoices seeded
          JOIN public.owner_products product
            ON product.owner_user_id = seeded.owner_user_id
           AND product.sku = 'CAU-HY-S70'
        )
        INSERT INTO public.sales_invoice_items (
          invoice_id,
          product_id,
          item_type,
          description,
          unit,
          quantity,
          unit_price_vnd,
          line_total_vnd
        )
        SELECT
          item.invoice_id,
          item.product_id,
          item.item_type,
          item.description,
          item.unit,
          item.quantity,
          item.unit_price_vnd,
          item.line_total_vnd
        FROM item_rows item
        WHERE NOT EXISTS (
          SELECT 1 FROM public.sales_invoice_items existing
          WHERE existing.invoice_id = item.invoice_id
            AND existing.item_type = item.item_type
        );

        -- Enrich the analytics history without creating fake accounts. Every
        -- real account receives deterministic sessions; anonymous visitors add
        -- realistic acquisition traffic. COUNT(users) remains authoritative.
        INSERT INTO public.web_visitors (
          visitor_key, user_id, first_seen_at, last_seen_at, created_at, updated_at
        )
        SELECT
          'seed-user-' || u.id::text,
          u.id,
          LEAST(u.created_at, now()),
          now(),
          LEAST(u.created_at, now()),
          now()
        FROM public.users u
        ON CONFLICT (visitor_key) DO UPDATE SET
          user_id = COALESCE(public.web_visitors.user_id, EXCLUDED.user_id),
          last_seen_at = GREATEST(public.web_visitors.last_seen_at, EXCLUDED.last_seen_at);

        WITH generated AS (
          SELECT
            u.id AS user_id,
            visitor.id AS visitor_id,
            visit_number,
            date_trunc('day', now())
              - make_interval(days => mod(
                  abs(hashtext(u.id::text || '-growth-' || visit_number::text)::bigint),
                  30
                )::int)
              + make_interval(hours => 7 + mod(visit_number * 5, 14)) AS visited_at
          FROM public.users u
          JOIN public.web_visitors visitor
            ON visitor.visitor_key = 'seed-user-' || u.id::text
          CROSS JOIN LATERAL generate_series(
            1,
            6 + mod(abs(hashtext(u.id::text || '-growth-count')::bigint), 7)::int
          ) AS visit_number
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
          'seed-growth-visit-' || user_id::text || '-' || visit_number::text,
          visitor_id,
          user_id,
          (ARRAY['/', '/player/discovery', '/player/booking', '/player/tournaments'])
            [1 + mod(visit_number - 1, 4)],
          (ARRAY['/player/discovery', '/player/bookings', '/player/profile', '/contact'])
            [1 + mod(visit_number, 4)],
          2 + mod(visit_number * 7, 9),
          'seed',
          LEAST(now() - interval '5 minutes', visited_at),
          LEAST(now(), visited_at + make_interval(mins => 8 + visit_number * 3)),
          LEAST(now() - interval '5 minutes', visited_at),
          LEAST(now(), visited_at + make_interval(mins => 8 + visit_number * 3))
        FROM generated
        ON CONFLICT (session_key) DO NOTHING;

        WITH anonymous_seed AS (
          SELECT number, mod(number * 11, 30)::int AS age_days
          FROM generate_series(1, 180) AS number
        )
        INSERT INTO public.web_visitors (
          visitor_key, first_seen_at, last_seen_at, created_at, updated_at
        )
        SELECT
          'seed-growth-anon-' || lpad(number::text, 4, '0'),
          now() - make_interval(days => age_days),
          now() - make_interval(days => floor(age_days / 2.0)::int),
          now() - make_interval(days => age_days),
          now() - make_interval(days => floor(age_days / 2.0)::int)
        FROM anonymous_seed
        ON CONFLICT (visitor_key) DO NOTHING;

        WITH anonymous_sessions AS (
          SELECT
            visitor.id AS visitor_id,
            visitor.visitor_key,
            session_number,
            LEAST(
              now() - interval '5 minutes',
              visitor.first_seen_at + make_interval(days => session_number - 1, hours => 2)
            ) AS visited_at
          FROM public.web_visitors visitor
          CROSS JOIN LATERAL generate_series(
            1,
            1 + mod(abs(hashtext(visitor.visitor_key)::bigint), 3)::int
          ) AS session_number
          WHERE visitor.visitor_key LIKE 'seed-growth-anon-%'
        )
        INSERT INTO public.web_visit_sessions (
          session_key,
          visitor_id,
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
          visitor_key || '-session-' || session_number::text,
          visitor_id,
          CASE WHEN mod(session_number, 2) = 0 THEN '/player/discovery' ELSE '/' END,
          CASE
            WHEN mod(session_number, 2) = 0 THEN '/player/booking'
            ELSE '/player/tournaments'
          END,
          1 + mod(session_number * 3, 7),
          'seed',
          visited_at,
          visited_at + make_interval(mins => 4 + session_number * 5),
          visited_at,
          visited_at + make_interval(mins => 4 + session_number * 5)
        FROM anonymous_sessions
        ON CONFLICT (session_key) DO NOTHING;
        """
    )


def downgrade() -> None:
    op.execute(
        r"""
        DELETE FROM public.web_visit_sessions
        WHERE session_key LIKE 'seed-growth-visit-%'
           OR session_key LIKE 'seed-growth-anon-%';
        DELETE FROM public.web_visitors
        WHERE visitor_key LIKE 'seed-growth-anon-%';

        DROP TRIGGER IF EXISTS trg_sales_invoices_updated_at ON public.sales_invoices;
        DROP TRIGGER IF EXISTS trg_owner_products_updated_at ON public.owner_products;
        DROP TRIGGER IF EXISTS trg_user_password_credentials_updated_at
        ON public.user_password_credentials;
        DROP TABLE IF EXISTS public.inventory_movements;
        DROP TABLE IF EXISTS public.sales_invoice_items;
        DROP TABLE IF EXISTS public.sales_invoices;
        DROP TABLE IF EXISTS public.owner_products;
        DROP TABLE IF EXISTS public.user_login_audits;
        DROP TABLE IF EXISTS public.user_password_credentials;

        DELETE FROM public.courts
        WHERE id IN (
          '00000000-0000-0000-0000-000000001611',
          '00000000-0000-0000-0000-000000001612',
          '00000000-0000-0000-0000-000000001613',
          '00000000-0000-0000-0000-000000001614'
        );
        DELETE FROM public.court_complexes
        WHERE id = '00000000-0000-0000-0000-000000001610';
        DELETE FROM public.owner_service_requests
        WHERE user_id = (
          SELECT id FROM public.users
          WHERE email = 'clb.badminton.fpt@fpt.edu.vn'
        ) AND review_note = 'Tài khoản demo được khởi tạo từ migration owner commerce';
        DELETE FROM public.owner_post_quotas
        WHERE owner_user_id = (
          SELECT id FROM public.users
          WHERE email = 'clb.badminton.fpt@fpt.edu.vn'
        );
        DELETE FROM public.user_role_assignments
        WHERE user_id = (
          SELECT id FROM public.users
          WHERE email = 'clb.badminton.fpt@fpt.edu.vn'
        ) AND reason = 'FPT badminton club demo owner';
        DELETE FROM public.users
        WHERE email = 'clb.badminton.fpt@fpt.edu.vn';
        """
    )
