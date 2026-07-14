# ruff: noqa: E501
"""reconcile FPT demo data, identity avatars, and account count

Revision ID: 0017_reconcile_demo_data
Revises: 0016_owner_commerce
Create Date: 2026-07-14
"""

from __future__ import annotations

from alembic import op

revision = "0017_reconcile_demo_data"
down_revision = "0016_owner_commerce"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        r"""
        -- Fix the legacy repeated Google avatar only. Real Google profile URLs
        -- are intentionally left untouched. ui-avatars renders initials from
        -- the supplied full name (for example, Nguyễn Hương Lan -> NL).
        UPDATE public.users
        SET
          avatar_url =
            'https://ui-avatars.com/api/?name='
            || replace(trim(full_name), ' ', '+')
            || '&background=4285F4&color=fff&size=96&bold=true&rounded=true&format=png&length=2',
          updated_at = now()
        WHERE avatar_url =
          'https://lh3.googleusercontent.com/a/ACg8ocLoV_JBX9SyHokysffYl69xXsmmrBctjoIoHftZ6Zz-V6f9JNw=s96-c';

        -- The three supplied records accidentally used HE19/HE20. Keep their
        -- UUIDs unchanged so bookings, Elo, visitors and future bills remain
        -- attached to the same people.
        UPDATE public.users
        SET
          email = CASE lower(email::text)
            WHEN 'taidxhe190009@fpt.edu.vn' THEN 'taidxhe180009@fpt.edu.vn'
            WHEN 'huybqhe194070@fpt.edu.vn' THEN 'huybqhe184070@fpt.edu.vn'
            WHEN 'duyndhe201969@fpt.edu.vn' THEN 'duyndhe181969@fpt.edu.vn'
            ELSE email::text
          END,
          updated_at = now()
        WHERE lower(email::text) IN (
          'taidxhe190009@fpt.edu.vn',
          'huybqhe194070@fpt.edu.vn',
          'duyndhe201969@fpt.edu.vn'
        );

        -- The generated demo cohort previously produced HE20xxxx. Its source
        -- generation is now HE188001..HE188100; this exact mapping prevents a
        -- later append-only import from creating duplicate accounts.
        WITH synthetic AS (
          SELECT
            u.id,
            u.email::text AS old_email,
            (
              (
                substring(u.email::text from '(?i)he(20[0-9]{4})')::integer
                - 200000
              ) / 37
            )::integer AS ordinal
          FROM public.users u
          WHERE u.email::text ~* 'he20[0-9]{4}@fpt[.]edu[.]vn$'
            AND (
              substring(u.email::text from '(?i)he(20[0-9]{4})')::integer - 200000
            ) BETWEEN 37 AND 3700
            AND mod(
              substring(u.email::text from '(?i)he(20[0-9]{4})')::integer - 200000,
              37
            ) = 0
        )
        UPDATE public.users u
        SET
          email = regexp_replace(
            synthetic.old_email,
            '(?i)he20[0-9]{4}',
            'he18' || lpad((8000 + synthetic.ordinal)::text, 4, '0')
          ),
          updated_at = now()
        FROM synthetic
        WHERE u.id = synthetic.id;

        -- Optional demo data remains opt-in and is never populated in production.
        DO $seed$
        BEGIN
          IF COALESCE(current_setting('netup.seed_demo_data', true), 'false') = 'true' THEN
        -- The local demo data began at 288 users. After the FPT owner created
        -- in 0016, add only as many player profiles as needed to reach the
        -- authoritative production-sized total of 303; never exceed it.
        WITH seed(id, email, full_name, phone, ordinal) AS (
          VALUES
            ('00000000-0000-0000-0000-000000001631'::uuid, 'longnbhe188301@fpt.edu.vn', 'Nguyễn Bảo Long', '0988303001', 1),
            ('00000000-0000-0000-0000-000000001632'::uuid, 'han.tths188302@fpt.edu.vn', 'Trần Gia Hân', '0988303002', 2),
            ('00000000-0000-0000-0000-000000001633'::uuid, 'minhlnhe188303@fpt.edu.vn', 'Lê Nhật Minh', '0988303003', 3),
            ('00000000-0000-0000-0000-000000001634'::uuid, 'linhpkhs188304@fpt.edu.vn', 'Phạm Khánh Linh', '0988303004', 4),
            ('00000000-0000-0000-0000-000000001635'::uuid, 'thanhhdhe188305@fpt.edu.vn', 'Hoàng Đức Thành', '0988303005', 5),
            ('00000000-0000-0000-0000-000000001636'::uuid, 'trangvths188306@fpt.edu.vn', 'Vũ Thu Trang', '0988303006', 6),
            ('00000000-0000-0000-0000-000000001637'::uuid, 'khoadmhe188307@fpt.edu.vn', 'Đặng Minh Khoa', '0988303007', 7),
            ('00000000-0000-0000-0000-000000001638'::uuid, 'anhbnhs188308@fpt.edu.vn', 'Bùi Ngọc Anh', '0988303008', 8),
            ('00000000-0000-0000-0000-000000001639'::uuid, 'huydqhe188309@fpt.edu.vn', 'Đỗ Quang Huy', '0988303009', 9),
            ('00000000-0000-0000-0000-000000001640'::uuid, 'ngocdbhs188310@fpt.edu.vn', 'Dương Bích Ngọc', '0988303010', 10),
            ('00000000-0000-0000-0000-000000001641'::uuid, 'kietpthe188311@fpt.edu.vn', 'Phan Tuấn Kiệt', '0988303011', 11),
            ('00000000-0000-0000-0000-000000001642'::uuid, 'anhvmhs188312@fpt.edu.vn', 'Võ Mai Anh', '0988303012', 12),
            ('00000000-0000-0000-0000-000000001643'::uuid, 'namdhhe188313@fpt.edu.vn', 'Đinh Hải Nam', '0988303013', 13),
            ('00000000-0000-0000-0000-000000001644'::uuid, 'thaolphs188314@fpt.edu.vn', 'Lý Phương Thảo', '0988303014', 14)
        ), available AS (
          SELECT greatest(0, 303 - count(*))::integer AS slots
          FROM public.users
        ), candidates AS (
          SELECT seed.*
          FROM seed
          WHERE NOT EXISTS (
            SELECT 1 FROM public.users existing WHERE existing.email = seed.email
          )
        ), inserted AS (
          INSERT INTO public.users (
            id,
            email,
            full_name,
            avatar_url,
            phone,
            city,
            district,
            is_active,
            created_at,
            updated_at
          )
          SELECT
            candidate.id,
            candidate.email,
            candidate.full_name,
            'https://ui-avatars.com/api/?name='
              || replace(candidate.full_name, ' ', '+')
              || '&background=4285F4&color=fff&size=96&bold=true&rounded=true&format=png&length=2',
            candidate.phone,
            'Hà Nội',
            (ARRAY['Thạch Thất', 'Quốc Oai', 'Cầu Giấy', 'Nam Từ Liêm'])[1 + mod(candidate.ordinal, 4)],
            true,
            now() - make_interval(days => 15 - candidate.ordinal),
            now() - make_interval(days => 15 - candidate.ordinal)
          FROM candidates candidate
          CROSS JOIN available
          WHERE candidate.ordinal <= available.slots
          ORDER BY candidate.ordinal
          ON CONFLICT (email) DO NOTHING
          RETURNING id
        )
        INSERT INTO public.user_role_assignments (user_id, role, reason)
        SELECT id, 'player', 'production-sized demo profile'
        FROM inserted
        ON CONFLICT DO NOTHING;

        INSERT INTO public.elo_ratings (
          player_user_id,
          elo_value,
          visible_skill_tier,
          matches_played,
          wins,
          losses,
          draws
        )
        SELECT
          u.id,
          1120 + mod((right(u.id::text, 4)::integer), 180),
          CASE
            WHEN 1120 + mod((right(u.id::text, 4)::integer), 180) >= 1300
              THEN 'Intermediate'::public.skill_tier
            ELSE 'Beginner'::public.skill_tier
          END,
          0,
          0,
          0,
          0
        FROM public.users u
        WHERE u.id BETWEEN '00000000-0000-0000-0000-000000001631'::uuid
          AND '00000000-0000-0000-0000-000000001644'::uuid
        ON CONFLICT (player_user_id) DO NOTHING;

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
          u.created_at,
          now(),
          u.created_at,
          now()
        FROM public.users u
        WHERE u.id BETWEEN '00000000-0000-0000-0000-000000001631'::uuid
          AND '00000000-0000-0000-0000-000000001644'::uuid
        ON CONFLICT (visitor_key) DO NOTHING;

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
          'seed-target-303-' || u.id::text || '-' || visit_number::text,
          visitor.id,
          u.id,
          (ARRAY['/', '/player/discovery', '/player/booking', '/player/tournaments'])[
            1 + mod(visit_number - 1, 4)
          ],
          (ARRAY['/player/discovery', '/player/bookings', '/player/profile', '/contact'])[
            1 + mod(visit_number, 4)
          ],
          3 + mod(visit_number * 5, 7),
          'seed',
          greatest(
            u.created_at,
            now() - make_interval(days => mod(visit_number * 3, 14), hours => visit_number)
          ),
          greatest(
            u.created_at + interval '5 minutes',
            now() - make_interval(days => mod(visit_number * 3, 14), hours => visit_number)
              + make_interval(mins => 8 + visit_number)
          ),
          greatest(
            u.created_at,
            now() - make_interval(days => mod(visit_number * 3, 14), hours => visit_number)
          ),
          greatest(
            u.created_at + interval '5 minutes',
            now() - make_interval(days => mod(visit_number * 3, 14), hours => visit_number)
              + make_interval(mins => 8 + visit_number)
          )
        FROM public.users u
        JOIN public.web_visitors visitor ON visitor.visitor_key = 'seed-user-' || u.id::text
        CROSS JOIN generate_series(1, 7) AS visit_number
        WHERE u.id BETWEEN '00000000-0000-0000-0000-000000001631'::uuid
          AND '00000000-0000-0000-0000-000000001644'::uuid
        ON CONFLICT (session_key) DO NOTHING;

        -- 0016 contained four synthetic bills per day. Replace only those
        -- labelled Excel demo receipts with the 287 original worksheet rows.
        -- Every daily total reconciles to cell B1 in NETUP-Doanh thu ngày.xlsx.
        DELETE FROM public.sales_invoices invoice
        USING public.users owner
        WHERE invoice.owner_user_id = owner.id
          AND owner.email = 'clb.badminton.fpt@fpt.edu.vn'
          AND invoice.source = 'excel_seed';

        WITH daily(sale_date, daily_total_vnd, amounts) AS (
          VALUES
            (DATE '2026-06-21', 1730000, ARRAY[62000,62000,62000,62000,62000,62000,62000,62000,62000,62000,62000,62000,62000,62000,62000,62000,41000,41000,41000,41000,20000,41000,41000,41000,41000,20000,62000,62000,62000,62000,62000,62000]::integer[]),
            (DATE '2026-06-22', 1765000, ARRAY[76000,76000,76000,76000,76000,76000,76000,76000,76000,76000,76000,76000,76000,50000,50000,50000,50000,50000,50000,50000,50000,76000,76000,76000,76000,76000,50000]::integer[]),
            (DATE '2026-06-24', 1580000, ARRAY[420000,70000,70000,70000,70000,70000,70000,70000,70000,70000,70000,70000,70000,47000,47000,47000,47000,47000,47000,47000,50000]::integer[]),
            (DATE '2026-06-26', 544000, ARRAY[57000,57000,57000,57000,57000,57000,57000,38000,38000,38000,38000]::integer[]),
            (DATE '2026-06-28', 1087000, ARRAY[68000,68000,68000,68000,68000,68000,68000,68000,68000,68000,68000,68000,45000,45000,45000,45000,45000,45000,50000]::integer[]),
            (DATE '2026-06-29', 364000, ARRAY[32000,32000,32000,32000,32000,32000,32000,32000,22000,22000,22000,22000,22000]::integer[]),
            (DATE '2026-06-30', 883000, ARRAY[48000,48000,48000,48000,48000,48000,48000,48000,48000,48000,48000,48000,48000,48000,48000,48000,48000,32000,32000]::integer[]),
            (DATE '2026-07-01', 535000, ARRAY[58000,58000,58000,58000,58000,58000,39000,39000,39000,39000,39000]::integer[]),
            (DATE '2026-07-02', 972000, ARRAY[81000,81000,81000,81000,81000,81000,81000,81000,54000,54000,54000,54000,54000,54000,50000]::integer[]),
            (DATE '2026-07-03', 1500000, ARRAY[84000,84000,84000,84000,84000,84000,84000,84000,84000,84000,84000,84000,84000,84000,56000,56000,56000,56000,56000,56000]::integer[]),
            (DATE '2026-07-05', 1139000, ARRAY[73000,73000,73000,73000,73000,73000,73000,73000,73000,73000,73000,73000,73000,49000,49000,49000,49000]::integer[]),
            (DATE '2026-07-06', 550000, ARRAY[60000,60000,60000,60000,60000,60000,60000,37000,37000,60000]::integer[]),
            (DATE '2026-07-07', 1424000, ARRAY[82000,82000,82000,82000,82000,82000,82000,82000,82000,82000,82000,82000,82000,55000,55000,55000,55000,82000,50000]::integer[]),
            (DATE '2026-07-08', 1529000, ARRAY[85000,85000,85000,85000,85000,85000,85000,85000,85000,85000,85000,85000,85000,30000,57000,57000,57000,57000,57000,57000,57000]::integer[]),
            (DATE '2026-07-10', 562000, ARRAY[68000,68000,68000,68000,68000,68000,68000,45000,45000]::integer[]),
            (DATE '2026-07-12', 739000, ARRAY[82000,82000,82000,82000,82000,82000,82000,55000,55000,55000]::integer[]),
            (DATE '2026-07-13', 1011000, ARRAY[68000,68000,68000,68000,68000,68000,68000,45000,45000,45000,100000,100000,200000]::integer[])
        ), raw AS (
          SELECT
            daily.sale_date,
            daily.daily_total_vnd,
            row_data.ordinal::integer,
            row_data.excel_amount_vnd
          FROM daily
          CROSS JOIN LATERAL unnest(daily.amounts)
            WITH ORDINALITY AS row_data(excel_amount_vnd, ordinal)
        ), ranked AS (
          SELECT
            raw.*,
            sum(excel_amount_vnd) OVER (PARTITION BY sale_date) AS raw_sum_vnd,
            row_number() OVER (
              PARTITION BY sale_date
              ORDER BY excel_amount_vnd DESC, ordinal DESC
            ) AS reconcile_rank
          FROM raw
        ), bills AS (
          SELECT
            sale_date,
            ordinal,
            excel_amount_vnd
              + CASE
                  WHEN reconcile_rank = 1 THEN daily_total_vnd - raw_sum_vnd
                  ELSE 0
                END AS invoice_total_vnd
          FROM ranked
        ), allocated AS (
          SELECT
            bills.*,
            CASE
              WHEN invoice_total_vnd >= 50000
                AND mod(ordinal + extract(day FROM sale_date)::integer, 3) <> 0
                THEN 1
              ELSE 0
            END AS water_quantity,
            CASE
              WHEN invoice_total_vnd >= 55000
                AND mod(ordinal + extract(day FROM sale_date)::integer * 2, 4) = 0
                THEN 1
              ELSE 0
            END AS shuttle_quantity
          FROM bills
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
          'FPT-' || to_char(allocated.sale_date, 'YYYYMMDD') || '-'
            || lpad(allocated.ordinal::text, 3, '0'),
          owner_account.id,
          customer.id,
          'paid',
          CASE
            WHEN mod(allocated.ordinal, 2) = 0 THEN 'bank_transfer'
            ELSE 'cash'
          END,
          allocated.invoice_total_vnd,
          0,
          allocated.invoice_total_vnd,
          'excel_seed',
          'excel-row:' || allocated.sale_date::text || ':' || allocated.ordinal::text,
          'Hóa đơn demo phân bổ từ dòng doanh thu trong NETUP-Doanh thu ngày.xlsx',
          (allocated.sale_date::timestamp + time '06:30') AT TIME ZONE 'Asia/Bangkok'
            + make_interval(mins => allocated.ordinal * 29),
          (allocated.sale_date::timestamp + time '06:30') AT TIME ZONE 'Asia/Bangkok'
            + make_interval(mins => allocated.ordinal * 29)
        FROM allocated
        CROSS JOIN owner_account
        LEFT JOIN LATERAL (
          SELECT candidate.id
          FROM public.users candidate
          WHERE candidate.is_active = true
            AND candidate.id <> owner_account.id
          ORDER BY md5(
            candidate.id::text || allocated.sale_date::text || allocated.ordinal::text
          )
          LIMIT 1
        ) customer ON true;

        WITH seeded_invoices AS (
          SELECT
            invoice.id AS invoice_id,
            invoice.owner_user_id,
            invoice.source_ref,
            invoice.total_vnd,
            substring(invoice.source_ref from '([0-9]+)$')::integer AS ordinal,
            substring(invoice.source_ref from 'excel-row:([0-9]{4}-[0-9]{2}-[0-9]{2})')::date
              AS sale_date
          FROM public.sales_invoices invoice
          JOIN public.users owner ON owner.id = invoice.owner_user_id
          WHERE owner.email = 'clb.badminton.fpt@fpt.edu.vn'
            AND invoice.source = 'excel_seed'
            AND invoice.source_ref LIKE 'excel-row:%'
        ), allocated AS (
          SELECT
            seeded_invoices.*,
            CASE
              WHEN total_vnd >= 50000
                AND mod(ordinal + extract(day FROM sale_date)::integer, 3) <> 0
                THEN 1
              ELSE 0
            END AS water_quantity,
            CASE
              WHEN total_vnd >= 55000
                AND mod(ordinal + extract(day FROM sale_date)::integer * 2, 4) = 0
                THEN 1
              ELSE 0
            END AS shuttle_quantity
          FROM seeded_invoices
        ), item_rows AS (
          SELECT
            allocated.invoice_id,
            NULL::uuid AS product_id,
            'court_rental'::text AS item_type,
            'Thuê sân cầu lông'::text AS description,
            'lượt'::text AS unit,
            1::numeric AS quantity,
            (
              allocated.total_vnd
              - allocated.water_quantity * 10000
              - allocated.shuttle_quantity * 30000
            )::integer AS unit_price_vnd,
            (
              allocated.total_vnd
              - allocated.water_quantity * 10000
              - allocated.shuttle_quantity * 30000
            )::integer AS line_total_vnd
          FROM allocated
          UNION ALL
          SELECT
            allocated.invoice_id,
            product.id,
            'water',
            product.name,
            product.unit,
            allocated.water_quantity::numeric,
            10000,
            allocated.water_quantity * 10000
          FROM allocated
          JOIN public.owner_products product
            ON product.owner_user_id = allocated.owner_user_id
           AND product.sku = 'NUOC-SUOI-01'
          WHERE allocated.water_quantity > 0
          UNION ALL
          SELECT
            allocated.invoice_id,
            product.id,
            'shuttlecock',
            product.name,
            product.unit,
            allocated.shuttle_quantity::numeric,
            30000,
            allocated.shuttle_quantity * 30000
          FROM allocated
          JOIN public.owner_products product
            ON product.owner_user_id = allocated.owner_user_id
           AND product.sku = 'CAU-HY-S70'
          WHERE allocated.shuttle_quantity > 0
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
          item_rows.invoice_id,
          item_rows.product_id,
          item_rows.item_type,
          item_rows.description,
          item_rows.unit,
          item_rows.quantity,
          item_rows.unit_price_vnd,
          item_rows.line_total_vnd
        FROM item_rows;

        -- Ledger opening stock is set so the historical retail movements and
        -- the current seeded product stock (500 water / 300 shuttlecocks) agree.
        INSERT INTO public.inventory_movements (
          product_id,
          movement_type,
          quantity_delta,
          note,
          created_by_user_id
        )
        SELECT
          product.id,
          'restock',
          product.stock_quantity + COALESCE(sum(item.quantity), 0),
          'Tồn kho đầu kỳ trước dữ liệu Excel',
          product.owner_user_id
        FROM public.owner_products product
        LEFT JOIN public.sales_invoice_items item ON item.product_id = product.id
        WHERE product.owner_user_id = (
          SELECT id FROM public.users WHERE email = 'clb.badminton.fpt@fpt.edu.vn'
        )
        GROUP BY product.id, product.stock_quantity, product.owner_user_id;

        INSERT INTO public.inventory_movements (
          product_id,
          invoice_item_id,
          movement_type,
          quantity_delta,
          note,
          created_by_user_id
        )
        SELECT
          item.product_id,
          item.id,
          'sale',
          -item.quantity,
          'Bán theo dữ liệu Excel',
          invoice.owner_user_id
        FROM public.sales_invoice_items item
        JOIN public.sales_invoices invoice ON invoice.id = item.invoice_id
        JOIN public.users owner ON owner.id = invoice.owner_user_id
        WHERE owner.email = 'clb.badminton.fpt@fpt.edu.vn'
          AND invoice.source = 'excel_seed'
          AND item.product_id IS NOT NULL;
          END IF;
        END
        $seed$;
        """
    )


def downgrade() -> None:
    # Corrections to email/avatar fields deliberately remain when rolling back:
    # restoring invalid student codes or a shared avatar would be destructive.
    op.execute(
        r"""
        DELETE FROM public.sales_invoices invoice
        USING public.users owner
        WHERE invoice.owner_user_id = owner.id
          AND owner.email = 'clb.badminton.fpt@fpt.edu.vn'
          AND invoice.source = 'excel_seed'
          AND invoice.source_ref LIKE 'excel-row:%';

        DELETE FROM public.web_visit_sessions
        WHERE session_key LIKE 'seed-target-303-%';
        DELETE FROM public.web_visitors
        WHERE visitor_key IN (
          SELECT 'seed-user-' || id::text
          FROM public.users
          WHERE id BETWEEN '00000000-0000-0000-0000-000000001631'::uuid
            AND '00000000-0000-0000-0000-000000001644'::uuid
        );
        DELETE FROM public.elo_ratings
        WHERE player_user_id BETWEEN '00000000-0000-0000-0000-000000001631'::uuid
          AND '00000000-0000-0000-0000-000000001644'::uuid;
        DELETE FROM public.user_role_assignments
        WHERE user_id BETWEEN '00000000-0000-0000-0000-000000001631'::uuid
          AND '00000000-0000-0000-0000-000000001644'::uuid
          AND reason = 'production-sized demo profile';
        DELETE FROM public.users
        WHERE id BETWEEN '00000000-0000-0000-0000-000000001631'::uuid
          AND '00000000-0000-0000-0000-000000001644'::uuid;
        """
    )
