-- Append-only NetUp user import for the 2026-07-14 production rollout.
-- Sources: new_user.txt (52 supplied users) + 100 deterministic demo users.
-- Safety guarantees:
--   * existing public.users rows are never updated or deleted;
--   * only rows returned by INSERT ... ON CONFLICT DO NOTHING receive role/Elo data;
--   * the whole import is transactional and protected by an advisory lock;
--   * rerunning this file inserts zero duplicate users.

BEGIN;

SELECT pg_advisory_xact_lock(hashtext('netup:append-only-user-import:2026-07-14'));

CREATE TEMP TABLE tmp_netup_user_candidates (
  ordinal integer NOT NULL,
  email text PRIMARY KEY,
  full_name text NOT NULL,
  phone text,
  avatar_url text NOT NULL,
  city text,
  district text,
  created_at timestamptz NOT NULL,
  source text NOT NULL,
  student_code text NOT NULL UNIQUE
) ON COMMIT DROP;

-- Email convention: <given-name><surname/middle initials><student-code>@fpt.edu.vn.
-- Example: Trần Trung Kiên / HE180644 -> kientthe180644@fpt.edu.vn.
WITH supplied_users(ordinal, student_code, full_name, email) AS (
  VALUES
    (1, 'HE180062', 'Trương Hồng Quy', 'quythhe180062@fpt.edu.vn'),
    (2, 'HE180157', 'Phạm Thế Toàn', 'toanpthe180157@fpt.edu.vn'),
    (3, 'HE180486', 'Nguyễn Trường An', 'annthe180486@fpt.edu.vn'),
    (4, 'HE180931', 'Kiều Đức Lâm', 'lamkdhe180931@fpt.edu.vn'),
    (5, 'HE180992', 'Cao Anh Tài', 'taicahe180992@fpt.edu.vn'),
    (6, 'HE181155', 'Quản Lan Anh', 'anhqlhe181155@fpt.edu.vn'),
    (7, 'HE181164', 'Trần Quang Đức', 'ductqhe181164@fpt.edu.vn'),
    (8, 'HE181169', 'Nguyễn Văn An', 'annvhe181169@fpt.edu.vn'),
    (9, 'HE181640', 'Phạm Đức Trọng', 'trongpdhe181640@fpt.edu.vn'),
    (10, 'HE181869', 'Phạm Quốc Tuấn', 'tuanpqhe181869@fpt.edu.vn'),
    (11, 'HE186038', 'Nguyễn Việt Hùng', 'hungnvhe186038@fpt.edu.vn'),
    (12, 'HE186791', 'Vũ Minh Tân', 'tanvmhe186791@fpt.edu.vn'),
    (13, 'HE186815', 'Nguyễn Đức Cường', 'cuongndhe186815@fpt.edu.vn'),
    (14, 'HE186884', 'Trần Minh Dũng', 'dungtmhe186884@fpt.edu.vn'),
    (15, 'HE186902', 'Nguyễn Chiến Thắng', 'thangnche186902@fpt.edu.vn'),
    (16, 'HE186918', 'Đặng Quang Khải', 'khaidqhe186918@fpt.edu.vn'),
    (17, 'HE187167', 'Lê Văn Triệu', 'trieulvhe187167@fpt.edu.vn'),
    (18, 'HE187201', 'Lê Xuân Hiếu', 'hieulxhe187201@fpt.edu.vn'),
    (19, 'HE187333', 'Phạm Đức Thuận', 'thuanpdhe187333@fpt.edu.vn'),
    (20, 'HE190009', 'Đỗ Xuân Tài', 'taidxhe190009@fpt.edu.vn'),
    (21, 'HE194070', 'Bùi Quang Huy', 'huybqhe194070@fpt.edu.vn'),
    (22, 'HE201969', 'Nguyễn Đức Duy', 'duyndhe201969@fpt.edu.vn'),
    (23, 'HS180005', 'Phạm Yến Nhi', 'nhipyhs180005@fpt.edu.vn'),
    (24, 'HS180176', 'Đào Thanh Thuỳ', 'thuydths180176@fpt.edu.vn'),
    (25, 'HS180285', 'Phạm Thị Duyên', 'duyenpths180285@fpt.edu.vn'),
    (26, 'HS180290', 'Vũ Thùy Trang', 'trangvths180290@fpt.edu.vn'),
    (27, 'HS180332', 'Nguyễn Thị Duyên', 'duyennths180332@fpt.edu.vn'),
    (28, 'HS180378', 'Dương Thị Như Quỳnh', 'quynhdtnhs180378@fpt.edu.vn'),
    (29, 'HS180391', 'Nguyễn Thị Thu Thủy', 'thuyntths180391@fpt.edu.vn'),
    (30, 'HS180397', 'Lê Thị Xuyến', 'xuyenlths180397@fpt.edu.vn'),
    (31, 'HS180460', 'Nguyễn Thị Phương Thảo', 'thaontphs180460@fpt.edu.vn'),
    (32, 'HS180594', 'Hoàng Thị Thu Thảo', 'thaohtths180594@fpt.edu.vn'),
    (33, 'HS180642', 'Nguyễn Thị Thuỳ Trang', 'trangntths180642@fpt.edu.vn'),
    (34, 'HS180681', 'Hà Đoan Trang', 'tranghdhs180681@fpt.edu.vn'),
    (35, 'HS180686', 'Dương Đức Đạt', 'datddhs180686@fpt.edu.vn'),
    (36, 'HS180737', 'Nguyễn Thị Thu', 'thunths180737@fpt.edu.vn'),
    (37, 'HS181003', 'Nguyễn Trần Mai Phương', 'phuongntmhs181003@fpt.edu.vn'),
    (38, 'HS181031', 'Đỗ Thị Thuý Nga', 'ngadtths181031@fpt.edu.vn'),
    (39, 'HS181092', 'Nguyễn Thị Luyến', 'luyennths181092@fpt.edu.vn'),
    (40, 'HS181119', 'Lê Huy Minh', 'minhlhhs181119@fpt.edu.vn'),
    (41, 'HS186128', 'Hoàng Thị Thảo', 'thaohths186128@fpt.edu.vn'),
    (42, 'HS186271', 'Nguyễn Hữu Phát', 'phatnhhs186271@fpt.edu.vn'),
    (43, 'HS186285', 'Nguyễn Trần Thảo My', 'myntths186285@fpt.edu.vn'),
    (44, 'HS186297', 'Mai Việt Huy', 'huymvhs186297@fpt.edu.vn'),
    (45, 'HS186345', 'Phạm Thị Thanh Thảo', 'thaoptths186345@fpt.edu.vn'),
    (46, 'HS186407', 'Hoàng Thị Minh', 'minhhths186407@fpt.edu.vn'),
    (47, 'HS186427', 'Phạm Thị Mai Hương', 'huongptmhs186427@fpt.edu.vn'),
    (48, 'HS186432', 'Nguyễn Minh Hoàng', 'hoangnmhs186432@fpt.edu.vn'),
    (49, 'HS186437', 'Trần Thị Lệ Quyên', 'quyenttlhs186437@fpt.edu.vn'),
    (50, 'HS186464', 'Nguyễn Văn Quang', 'quangnvhs186464@fpt.edu.vn'),
    (51, 'HS186481', 'Đoàn Ngọc Mai', 'maidnhs186481@fpt.edu.vn'),
    (52, 'HS189004', 'Trịnh Quốc Khánh', 'khanhtqhs189004@fpt.edu.vn')
)
INSERT INTO tmp_netup_user_candidates (
  ordinal,
  email,
  full_name,
  phone,
  avatar_url,
  city,
  district,
  created_at,
  source,
  student_code
)
SELECT
  ordinal,
  email,
  full_name,
  NULL,
  'https://lh3.googleusercontent.com/a/ACg8ocLoV_JBX9SyHokysffYl69xXsmmrBctjoIoHftZ6Zz-V6f9JNw=s96-c',
  'Hà Nội',
  'Thạch Thất',
  now() - make_interval(days => 2 + ((ordinal * 7) % 45), hours => (ordinal * 5) % 18),
  'new_user.txt',
  student_code
FROM supplied_users;

-- 20 common Vietnamese surnames x 5 curated name profiles = 100 realistic demo users.
-- Codes, emails, phones, locations and timestamps are deterministic and unique.
WITH surnames(surname_order, display_name, email_initial) AS (
  VALUES
    (1, 'Nguyễn', 'n'),
    (2, 'Trần', 't'),
    (3, 'Lê', 'l'),
    (4, 'Phạm', 'p'),
    (5, 'Hoàng', 'h'),
    (6, 'Vũ', 'v'),
    (7, 'Đặng', 'd'),
    (8, 'Bùi', 'b'),
    (9, 'Đỗ', 'd'),
    (10, 'Dương', 'd'),
    (11, 'Phan', 'p'),
    (12, 'Võ', 'v'),
    (13, 'Đinh', 'd'),
    (14, 'Lý', 'l'),
    (15, 'Trịnh', 't'),
    (16, 'Đoàn', 'd'),
    (17, 'Mai', 'm'),
    (18, 'Cao', 'c'),
    (19, 'Hồ', 'h'),
    (20, 'Tạ', 't')
), name_profiles(profile_order, display_name, given_ascii, middle_initials) AS (
  VALUES
    (1, 'Minh Quân', 'quan', 'm'),
    (2, 'Đức Anh', 'anh', 'd'),
    (3, 'Gia Bảo', 'bao', 'g'),
    (4, 'Thị Ngọc Anh', 'anh', 'tn'),
    (5, 'Mai Phương', 'phuong', 'm')
), generated AS (
  SELECT
    52 + ((surname_order - 1) * 5) + profile_order AS ordinal,
    'HE' || (200000 + (((surname_order - 1) * 5) + profile_order) * 37)::text AS student_code,
    surnames.display_name || ' ' || name_profiles.display_name AS full_name,
    given_ascii || email_initial || middle_initials
      || lower('HE' || (200000 + (((surname_order - 1) * 5) + profile_order) * 37)::text)
      || '@fpt.edu.vn' AS email
  FROM surnames
  CROSS JOIN name_profiles
)
INSERT INTO tmp_netup_user_candidates (
  ordinal,
  email,
  full_name,
  phone,
  avatar_url,
  city,
  district,
  created_at,
  source,
  student_code
)
SELECT
  ordinal,
  email,
  full_name,
  '09' || lpad(((ordinal * 7919) % 100000000)::text, 8, '0'),
  'https://lh3.googleusercontent.com/a/ACg8ocLoV_JBX9SyHokysffYl69xXsmmrBctjoIoHftZ6Zz-V6f9JNw=s96-c',
  'Hà Nội',
  (ARRAY['Thạch Thất', 'Quốc Oai', 'Nam Từ Liêm', 'Cầu Giấy', 'Hà Đông'])[
    1 + (ordinal % 5)
  ],
  now() - make_interval(days => 3 + ((ordinal * 13) % 120), hours => (ordinal * 7) % 20),
  'synthetic_demo_2026',
  student_code
FROM generated;

CREATE TEMP TABLE tmp_netup_inserted_users (
  id uuid PRIMARY KEY,
  email citext NOT NULL UNIQUE
) ON COMMIT DROP;

-- The only public.users mutation in this file is INSERT. Conflicts are untouched.
WITH inserted AS (
  INSERT INTO public.users (
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
    email::citext,
    full_name,
    avatar_url,
    NULLIF(phone, ''),
    city,
    district,
    true,
    created_at,
    created_at
  FROM tmp_netup_user_candidates
  ORDER BY ordinal
  ON CONFLICT (email) DO NOTHING
  RETURNING id, email
)
INSERT INTO tmp_netup_inserted_users (id, email)
SELECT id, email FROM inserted;

-- Assign defaults only to users inserted by this transaction.
INSERT INTO public.user_role_assignments (user_id, role, granted_at, reason)
SELECT
  inserted.id,
  'player'::public.user_role,
  candidates.created_at,
  'append-only import: ' || candidates.source
FROM tmp_netup_inserted_users inserted
JOIN tmp_netup_user_candidates candidates ON candidates.email::citext = inserted.email
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
  inserted.id,
  1000 + ((candidates.ordinal * 17) % 360),
  CASE
    WHEN 1000 + ((candidates.ordinal * 17) % 360) >= 1300
      THEN 'Intermediate'::public.skill_tier
    ELSE 'Beginner'::public.skill_tier
  END,
  0,
  0,
  0,
  0
FROM tmp_netup_inserted_users inserted
JOIN tmp_netup_user_candidates candidates ON candidates.email::citext = inserted.email
ON CONFLICT (player_user_id) DO NOTHING;

-- Last result set is consumed by app.scripts.import_users for deployment logs.
SELECT
  (SELECT count(*)::int FROM tmp_netup_user_candidates) AS candidate_count,
  (SELECT count(*)::int FROM tmp_netup_user_candidates WHERE source = 'new_user.txt')
    AS supplied_candidate_count,
  (SELECT count(*)::int FROM tmp_netup_user_candidates WHERE source = 'synthetic_demo_2026')
    AS synthetic_candidate_count,
  (SELECT count(*)::int FROM tmp_netup_inserted_users) AS inserted_count,
  (
    SELECT count(*)::int
    FROM tmp_netup_user_candidates candidates
    WHERE NOT EXISTS (
      SELECT 1 FROM tmp_netup_inserted_users inserted
      WHERE inserted.email = candidates.email::citext
    )
  ) AS skipped_existing_count;

COMMIT;
