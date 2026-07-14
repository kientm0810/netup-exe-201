-- NetUp PostgreSQL schema (total product scope)
-- Generated from /netup-exe-201/business.md

create extension if not exists pgcrypto;
create extension if not exists btree_gist;
create extension if not exists citext;

-- Enums
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
    CREATE TYPE public.user_role AS ENUM ('player', 'owner', 'admin');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'owner_request_status') THEN
    CREATE TYPE public.owner_request_status AS ENUM ('pending', 'approved', 'rejected', 'cancelled');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'sport_type') THEN
    CREATE TYPE public.sport_type AS ENUM ('Badminton', 'Football', 'Tennis');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'skill_tier') THEN
    CREATE TYPE public.skill_tier AS ENUM ('Beginner', 'Intermediate', 'Advanced');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'court_status') THEN
    CREATE TYPE public.court_status AS ENUM ('active', 'maintenance', 'inactive');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'session_post_type') THEN
    CREATE TYPE public.session_post_type AS ENUM ('pool', 'rental');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'session_status') THEN
    CREATE TYPE public.session_status AS ENUM ('scheduled', 'locked', 'in_progress', 'completed', 'cancelled');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'pool_post_status') THEN
    CREATE TYPE public.pool_post_status AS ENUM ('open', 'full', 'closed', 'cancelled');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'booking_mode') THEN
    CREATE TYPE public.booking_mode AS ENUM ('solo', 'full_court');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'booking_status') THEN
    CREATE TYPE public.booking_status AS ENUM (
      'awaiting_deposit',
      'deposit_paid',
      'confirmed',
      'checked_in',
      'completed',
      'cancelled',
      'expired'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_method') THEN
    CREATE TYPE public.payment_method AS ENUM ('vnpay', 'cash');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_transaction_kind') THEN
    CREATE TYPE public.payment_transaction_kind AS ENUM ('deposit', 'remaining', 'refund');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_status') THEN
    CREATE TYPE public.payment_status AS ENUM (
      'pending',
      'processing',
      'paid',
      'failed',
      'expired',
      'cancelled',
      'refunded'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'chat_room_status') THEN
    CREATE TYPE public.chat_room_status AS ENUM ('active', 'closed', 'archived');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'chat_member_role') THEN
    CREATE TYPE public.chat_member_role AS ENUM ('host', 'member', 'moderator');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'chat_message_type') THEN
    CREATE TYPE public.chat_message_type AS ENUM ('text', 'system');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'match_status') THEN
    CREATE TYPE public.match_status AS ENUM ('pending', 'finalized', 'void');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'match_result') THEN
    CREATE TYPE public.match_result AS ENUM ('win', 'loss', 'draw', 'void');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'feedback_target_type') THEN
    CREATE TYPE public.feedback_target_type AS ENUM ('teammate', 'opponent');
  END IF;
END;
$$;

-- Helpers
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.skill_tier_rank(input_skill public.skill_tier)
RETURNS smallint
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE input_skill
    WHEN 'Beginner' THEN 1
    WHEN 'Intermediate' THEN 2
    WHEN 'Advanced' THEN 3
  END;
$$;

CREATE OR REPLACE FUNCTION public.set_session_ends_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.ends_at = NEW.starts_at + make_interval(mins => NEW.duration_minutes);
  RETURN NEW;
END;
$$;

-- Users and auth
CREATE TABLE IF NOT EXISTS public.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email citext NOT NULL UNIQUE,
  full_name text NOT NULL,
  avatar_url text,
  phone text,
  city text,
  district text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.oauth_identities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider = 'google'),
  provider_user_id text NOT NULL,
  provider_email citext,
  provider_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_login_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_user_id),
  UNIQUE (user_id, provider)
);

CREATE TABLE IF NOT EXISTS public.user_role_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  role public.user_role NOT NULL,
  granted_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  granted_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  reason text,
  CHECK (revoked_at IS NULL OR revoked_at >= granted_at)
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_user_role_active
ON public.user_role_assignments(user_id, role)
WHERE revoked_at IS NULL;

-- Website analytics. A visitor persists in browser local storage, while a visit
-- session rotates after 30 minutes of inactivity. Registered users are linked
-- when an authenticated cookie is present; anonymous traffic remains measurable.
CREATE TABLE IF NOT EXISTS public.web_visitors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visitor_key varchar(80) NOT NULL UNIQUE,
  user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (length(visitor_key) BETWEEN 8 AND 80),
  CHECK (last_seen_at >= first_seen_at)
);

CREATE TABLE IF NOT EXISTS public.web_visit_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_key varchar(80) NOT NULL UNIQUE,
  visitor_id uuid NOT NULL REFERENCES public.web_visitors(id) ON DELETE CASCADE,
  user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  entry_path varchar(500) NOT NULL,
  last_path varchar(500) NOT NULL,
  page_view_count integer NOT NULL DEFAULT 1 CHECK (page_view_count >= 1),
  source varchar(20) NOT NULL DEFAULT 'web' CHECK (source IN ('web', 'seed')),
  started_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (length(session_key) BETWEEN 8 AND 80),
  CHECK (length(entry_path) BETWEEN 1 AND 500),
  CHECK (length(last_path) BETWEEN 1 AND 500),
  CHECK (last_seen_at >= started_at)
);

CREATE TABLE IF NOT EXISTS public.owner_service_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  business_name text NOT NULL,
  contact_phone text,
  facility_overview text,
  status public.owner_request_status NOT NULL DEFAULT 'pending',
  submitted_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  reviewed_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  review_note text
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_owner_request_pending_per_user
ON public.owner_service_requests(user_id)
WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS public.contact_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  phone text NOT NULL,
  email citext NOT NULL,
  partner_type text NOT NULL,
  organization_name text NOT NULL,
  address text NOT NULL,
  message text,
  source text NOT NULL DEFAULT 'web',
  status text NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'contacted', 'qualified', 'closed')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.admin_configs (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  platform_fee_rate numeric(6,4) NOT NULL CHECK (platform_fee_rate BETWEEN 0 AND 1),
  floor_fee_vnd integer NOT NULL CHECK (floor_fee_vnd >= 0),
  deposit_percent numeric(5,2) NOT NULL CHECK (deposit_percent BETWEEN 0 AND 100),
  matching_radius_km numeric(6,2) NOT NULL CHECK (matching_radius_km > 0),
  no_show_strike_limit integer NOT NULL CHECK (no_show_strike_limit >= 1),
  auto_release_minutes integer NOT NULL CHECK (auto_release_minutes BETWEEN 1 AND 180),
  video_assessment_max_size_mb integer NOT NULL DEFAULT 5 CHECK (video_assessment_max_size_mb BETWEEN 1 AND 100),
  video_assessment_max_duration_seconds integer NOT NULL DEFAULT 60 CHECK (video_assessment_max_duration_seconds BETWEEN 5 AND 300),
  support_hotline_enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.admin_configs (
  id,
  platform_fee_rate,
  floor_fee_vnd,
  deposit_percent,
  matching_radius_km,
  no_show_strike_limit,
  auto_release_minutes,
  video_assessment_max_size_mb,
  video_assessment_max_duration_seconds,
  support_hotline_enabled
)
VALUES (1, 0.10, 3000, 30.00, 5.00, 3, 15, 5, 60, true)
ON CONFLICT (id) DO NOTHING;

-- Court inventory
CREATE TABLE IF NOT EXISTS public.court_complexes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  name text NOT NULL,
  district text NOT NULL,
  address text NOT NULL,
  latitude double precision,
  longitude double precision,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_user_id, name)
);

CREATE TABLE IF NOT EXISTS public.courts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  complex_id uuid NOT NULL REFERENCES public.court_complexes(id) ON DELETE CASCADE,
  owner_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  name text NOT NULL,
  sub_court_name text NOT NULL,
  sport public.sport_type NOT NULL,
  status public.court_status NOT NULL DEFAULT 'active',
  rating numeric(2,1) NOT NULL DEFAULT 0 CHECK (rating BETWEEN 0 AND 5),
  image_url text,
  amenities text[] NOT NULL DEFAULT '{}',
  base_price_vnd integer NOT NULL CHECK (base_price_vnd >= 0),
  max_rental_duration_minutes integer NOT NULL CHECK (
    max_rental_duration_minutes IN (30, 60, 90, 120, 150, 180, 210, 240, 270, 300)
  ),
  min_rental_duration_minutes integer NOT NULL DEFAULT 60 CHECK (
    min_rental_duration_minutes IN (30, 60, 90, 120, 150, 180, 210, 240, 270, 300)
  ),
  open_time time NOT NULL DEFAULT '05:00:00',
  close_time time NOT NULL DEFAULT '22:30:00',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (complex_id, sub_court_name)
);

-- Sessions and pools
CREATE TABLE IF NOT EXISTS public.sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  court_id uuid NOT NULL REFERENCES public.courts(id) ON DELETE CASCADE,
  created_by_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text,
  post_type public.session_post_type NOT NULL DEFAULT 'pool',
  status public.session_status NOT NULL DEFAULT 'scheduled',
  image_url text,
  starts_at timestamptz NOT NULL,
  duration_minutes integer NOT NULL CHECK (
    duration_minutes IN (30, 60, 90, 120, 150, 180, 210, 240, 270, 300)
  ),
  ends_at timestamptz NOT NULL,
  open_slots integer NOT NULL CHECK (open_slots >= 0),
  max_slots integer NOT NULL CHECK (max_slots > 0),
  required_skill_min public.skill_tier NOT NULL DEFAULT 'Beginner',
  required_skill_max public.skill_tier NOT NULL DEFAULT 'Advanced',
  slot_price_vnd integer NOT NULL CHECK (slot_price_vnd >= 0),
  full_court_price_vnd integer NOT NULL CHECK (full_court_price_vnd >= 0),
  is_peak_hour boolean NOT NULL DEFAULT false,
  allows_solo_join boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (open_slots <= max_slots),
  CHECK (public.skill_tier_rank(required_skill_min) <= public.skill_tier_rank(required_skill_max))
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sessions_no_overlap_per_court'
  ) THEN
    ALTER TABLE public.sessions
      ADD CONSTRAINT sessions_no_overlap_per_court
      EXCLUDE USING gist (
        court_id WITH =,
        tstzrange(starts_at, ends_at, '[)') WITH &&
      )
      WHERE (status IN ('scheduled', 'locked', 'in_progress'));
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS public.pool_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL UNIQUE REFERENCES public.sessions(id) ON DELETE CASCADE,
  host_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  status public.pool_post_status NOT NULL DEFAULT 'open',
  total_slots integer NOT NULL CHECK (total_slots >= 2),
  host_slots integer NOT NULL CHECK (host_slots >= 1),
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (host_slots <= total_slots)
);

CREATE TABLE IF NOT EXISTS public.owner_post_quotas (
  owner_user_id uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  rental_post_limit integer NOT NULL DEFAULT 10 CHECK (rental_post_limit >= 0),
  slot_post_limit integer NOT NULL DEFAULT 10 CHECK (slot_post_limit >= 0),
  updated_by_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Booking, payment, check-in
CREATE TABLE IF NOT EXISTS public.bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_code text NOT NULL UNIQUE,
  session_id uuid NOT NULL REFERENCES public.sessions(id) ON DELETE RESTRICT,
  court_id uuid NOT NULL REFERENCES public.courts(id) ON DELETE RESTRICT,
  player_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  mode public.booking_mode NOT NULL,
  seats_booked integer NOT NULL CHECK (seats_booked > 0),
  status public.booking_status NOT NULL DEFAULT 'awaiting_deposit',
  payment_method public.payment_method NOT NULL,
  base_price_vnd integer NOT NULL CHECK (base_price_vnd >= 0),
  floor_fee_vnd integer NOT NULL CHECK (floor_fee_vnd >= 0),
  platform_fee_vnd integer NOT NULL CHECK (platform_fee_vnd >= 0),
  total_price_vnd integer NOT NULL CHECK (total_price_vnd >= 0),
  deposit_required_vnd integer NOT NULL CHECK (deposit_required_vnd > 0),
  remaining_due_vnd integer NOT NULL CHECK (remaining_due_vnd >= 0),
  qr_payload text NOT NULL,
  checked_in_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  cancel_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (deposit_required_vnd <= total_price_vnd),
  CHECK (deposit_required_vnd + remaining_due_vnd = total_price_vnd),
  CHECK (
    (mode = 'solo' AND seats_booked BETWEEN 1 AND 2)
    OR (mode = 'full_court' AND seats_booked > 0)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_booking_active_user_session
ON public.bookings(session_id, player_user_id)
WHERE status NOT IN ('cancelled', 'expired');

CREATE TABLE IF NOT EXISTS public.payment_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  kind public.payment_transaction_kind NOT NULL,
  method public.payment_method NOT NULL,
  provider text,
  provider_transaction_id text,
  external_ref text,
  amount_vnd integer NOT NULL CHECK (amount_vnd > 0),
  status public.payment_status NOT NULL DEFAULT 'pending',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  requested_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz,
  failed_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (kind = 'deposit' AND method = 'vnpay')
    OR (kind = 'remaining' AND method IN ('vnpay', 'cash'))
    OR (kind = 'refund' AND method = 'vnpay')
  ),
  CHECK (
    (method = 'vnpay' AND provider IS NOT NULL)
    OR (method = 'cash' AND provider IS NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_payment_provider_txn
ON public.payment_transactions(provider, provider_transaction_id)
WHERE provider_transaction_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.checkins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL UNIQUE REFERENCES public.bookings(id) ON DELETE CASCADE,
  owner_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  checkin_method text NOT NULL CHECK (checkin_method IN ('booking_code', 'qr')),
  cash_collected_vnd integer NOT NULL DEFAULT 0 CHECK (cash_collected_vnd >= 0),
  note text,
  checked_in_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Assessment and Elo
CREATE TABLE IF NOT EXISTS public.player_assessments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  sport public.sport_type NOT NULL,
  form_version text NOT NULL,
  answers jsonb NOT NULL DEFAULT '{}'::jsonb,
  computed_elo integer NOT NULL CHECK (computed_elo BETWEEN 100 AND 5000),
  computed_skill_tier public.skill_tier NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (player_user_id, sport)
);

CREATE TABLE IF NOT EXISTS public.video_assessments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  sport public.sport_type NOT NULL,
  storage_key text NOT NULL,
  original_filename text NOT NULL,
  mime_type text NOT NULL CHECK (mime_type IN ('video/mp4', 'video/quicktime', 'video/webm')),
  file_size_bytes integer NOT NULL CHECK (file_size_bytes > 0),
  duration_seconds numeric(8,2) CHECK (duration_seconds IS NULL OR duration_seconds >= 0),
  status text NOT NULL DEFAULT 'uploaded' CHECK (status IN ('uploaded', 'analyzing', 'completed', 'failed')),
  llm_provider text NOT NULL DEFAULT 'gemini' CHECK (llm_provider = 'gemini'),
  llm_model text,
  llm_raw_response jsonb,
  normalized_result jsonb,
  computed_elo integer CHECK (computed_elo BETWEEN 100 AND 5000),
  computed_skill_tier public.skill_tier,
  confidence numeric(4,3) CHECK (confidence IS NULL OR confidence BETWEEN 0 AND 1),
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_video_assessments_player_active
ON public.video_assessments(player_user_id)
WHERE status IN ('uploaded', 'analyzing');

CREATE TABLE IF NOT EXISTS public.elo_ratings (
  player_user_id uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  elo_value integer NOT NULL DEFAULT 1000 CHECK (elo_value BETWEEN 100 AND 5000),
  visible_skill_tier public.skill_tier NOT NULL DEFAULT 'Beginner',
  matches_played integer NOT NULL DEFAULT 0 CHECK (matches_played >= 0),
  wins integer NOT NULL DEFAULT 0 CHECK (wins >= 0),
  losses integer NOT NULL DEFAULT 0 CHECK (losses >= 0),
  draws integer NOT NULL DEFAULT 0 CHECK (draws >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.match_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL UNIQUE REFERENCES public.sessions(id) ON DELETE CASCADE,
  status public.match_status NOT NULL DEFAULT 'pending',
  recorded_by_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  team_a_score integer CHECK (team_a_score >= 0),
  team_b_score integer CHECK (team_b_score >= 0),
  started_at timestamptz,
  ended_at timestamptz,
  finalized_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.match_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL REFERENCES public.match_events(id) ON DELETE CASCADE,
  booking_id uuid REFERENCES public.bookings(id) ON DELETE SET NULL,
  player_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  team_side smallint NOT NULL CHECK (team_side IN (1, 2)),
  result public.match_result,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (match_id, player_user_id),
  UNIQUE (match_id, booking_id)
);

CREATE TABLE IF NOT EXISTS public.match_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL REFERENCES public.match_events(id) ON DELETE CASCADE,
  from_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  to_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  target_type public.feedback_target_type NOT NULL,
  rating smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (match_id, from_user_id, to_user_id),
  CHECK (from_user_id <> to_user_id)
);

CREATE TABLE IF NOT EXISTS public.elo_rating_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  match_id uuid REFERENCES public.match_events(id) ON DELETE SET NULL,
  old_elo integer NOT NULL,
  new_elo integer NOT NULL,
  delta integer NOT NULL,
  reason text NOT NULL,
  algorithm_version text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Pool group chat
CREATE TABLE IF NOT EXISTS public.chat_rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pool_post_id uuid NOT NULL UNIQUE REFERENCES public.pool_posts(id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  created_by_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  status public.chat_room_status NOT NULL DEFAULT 'active',
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.chat_room_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES public.chat_rooms(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  role public.chat_member_role NOT NULL DEFAULT 'member',
  joined_at timestamptz NOT NULL DEFAULT now(),
  left_at timestamptz,
  UNIQUE (room_id, user_id),
  CHECK (left_at IS NULL OR left_at >= joined_at)
);

CREATE TABLE IF NOT EXISTS public.chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES public.chat_rooms(id) ON DELETE CASCADE,
  sender_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  message_type public.chat_message_type NOT NULL DEFAULT 'text',
  content text NOT NULL CHECK (length(trim(content)) > 0),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  edited_at timestamptz,
  deleted_at timestamptz
);

-- Audit
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Validation triggers
CREATE OR REPLACE FUNCTION public.validate_booking_row()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  session_record RECORD;
BEGIN
  SELECT id, court_id, max_slots, status
  INTO session_record
  FROM public.sessions
  WHERE id = NEW.session_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Session % does not exist', NEW.session_id;
  END IF;

  IF session_record.status IN ('completed', 'cancelled') THEN
    RAISE EXCEPTION 'Cannot book a completed/cancelled session';
  END IF;

  NEW.court_id := session_record.court_id;

  IF NEW.mode = 'full_court' THEN
    IF NEW.seats_booked <> session_record.max_slots THEN
      RAISE EXCEPTION 'Full-court booking must reserve exactly max_slots (%)', session_record.max_slots;
    END IF;
  ELSE
    IF NEW.seats_booked < 1 OR NEW.seats_booked > 2 THEN
      RAISE EXCEPTION 'Solo booking seats must be between 1 and 2';
    END IF;
  END IF;

  IF NEW.deposit_required_vnd <= 0 THEN
    RAISE EXCEPTION 'Deposit must be greater than 0';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_checkin_row()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  booking_record RECORD;
  court_owner uuid;
BEGIN
  SELECT b.*, c.owner_user_id AS court_owner_user_id
  INTO booking_record
  FROM public.bookings b
  JOIN public.courts c ON c.id = b.court_id
  WHERE b.id = NEW.booking_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking % does not exist', NEW.booking_id;
  END IF;

  court_owner := booking_record.court_owner_user_id;
  IF court_owner <> NEW.owner_user_id THEN
    RAISE EXCEPTION 'Owner % cannot check in booking %', NEW.owner_user_id, NEW.booking_id;
  END IF;

  IF booking_record.status NOT IN ('deposit_paid', 'confirmed') THEN
    RAISE EXCEPTION 'Booking status % cannot be checked in', booking_record.status;
  END IF;

  IF booking_record.payment_method = 'cash' THEN
    IF NEW.cash_collected_vnd < booking_record.remaining_due_vnd THEN
      RAISE EXCEPTION 'Cash collected (%) must cover remaining due (%)', NEW.cash_collected_vnd, booking_record.remaining_due_vnd;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_checkin_side_effects()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE public.bookings
  SET status = 'checked_in',
      checked_in_at = NEW.checked_in_at,
      updated_at = now()
  WHERE id = NEW.booking_id;

  IF NEW.cash_collected_vnd > 0 THEN
    INSERT INTO public.payment_transactions (
      booking_id,
      kind,
      method,
      provider,
      provider_transaction_id,
      external_ref,
      amount_vnd,
      status,
      metadata,
      paid_at
    ) VALUES (
      NEW.booking_id,
      'remaining',
      'cash',
      NULL,
      NULL,
      CONCAT('CASH-CHECKIN-', NEW.id::text),
      NEW.cash_collected_vnd,
      'paid',
      jsonb_build_object('source', 'checkin', 'checkin_id', NEW.id),
      NEW.checked_in_at
    );
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_chat_room_row()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  pool_record RECORD;
BEGIN
  SELECT p.session_id, p.host_user_id
  INTO pool_record
  FROM public.pool_posts p
  WHERE p.id = NEW.pool_post_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pool post % does not exist', NEW.pool_post_id;
  END IF;

  IF NEW.session_id <> pool_record.session_id THEN
    RAISE EXCEPTION 'Chat room session_id must match pool session_id';
  END IF;

  IF NEW.created_by_user_id <> pool_record.host_user_id THEN
    RAISE EXCEPTION 'Only pool host can create pool chat room';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_chat_member_row()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  room_record RECORD;
  is_pool_host boolean := false;
  has_active_booking boolean := false;
BEGIN
  SELECT r.pool_post_id, r.session_id
  INTO room_record
  FROM public.chat_rooms r
  WHERE r.id = NEW.room_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Chat room % does not exist', NEW.room_id;
  END IF;

  SELECT TRUE INTO is_pool_host
  FROM public.pool_posts p
  WHERE p.id = room_record.pool_post_id
    AND p.host_user_id = NEW.user_id;

  SELECT TRUE INTO has_active_booking
  FROM public.bookings b
  WHERE b.session_id = room_record.session_id
    AND b.player_user_id = NEW.user_id
    AND b.status NOT IN ('cancelled', 'expired')
  LIMIT 1;

  IF COALESCE(is_pool_host, false) = false AND COALESCE(has_active_booking, false) = false THEN
    RAISE EXCEPTION 'User % is not eligible to join room %', NEW.user_id, NEW.room_id;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_chat_message_row()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  has_active_membership boolean := false;
BEGIN
  SELECT TRUE INTO has_active_membership
  FROM public.chat_room_members m
  WHERE m.room_id = NEW.room_id
    AND m.user_id = NEW.sender_user_id
    AND m.left_at IS NULL
  LIMIT 1;

  IF COALESCE(has_active_membership, false) = false THEN
    RAISE EXCEPTION 'Sender % is not an active member of room %', NEW.sender_user_id, NEW.room_id;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_match_feedback_row()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  from_team smallint;
  to_team smallint;
BEGIN
  IF NEW.from_user_id = NEW.to_user_id THEN
    RAISE EXCEPTION 'Cannot feedback to self';
  END IF;

  SELECT mp.team_side INTO from_team
  FROM public.match_participants mp
  WHERE mp.match_id = NEW.match_id
    AND mp.player_user_id = NEW.from_user_id;

  SELECT mp.team_side INTO to_team
  FROM public.match_participants mp
  WHERE mp.match_id = NEW.match_id
    AND mp.player_user_id = NEW.to_user_id;

  IF from_team IS NULL OR to_team IS NULL THEN
    RAISE EXCEPTION 'Both users must belong to match participants';
  END IF;

  IF NEW.target_type = 'teammate' AND from_team <> to_team THEN
    RAISE EXCEPTION 'Teammate feedback requires same team_side';
  END IF;

  IF NEW.target_type = 'opponent' AND from_team = to_team THEN
    RAISE EXCEPTION 'Opponent feedback requires different team_side';
  END IF;

  RETURN NEW;
END;
$$;

-- Trigger bindings
DROP TRIGGER IF EXISTS trg_users_updated_at ON public.users;
CREATE TRIGGER trg_users_updated_at
BEFORE UPDATE ON public.users
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_web_visitors_updated_at ON public.web_visitors;
CREATE TRIGGER trg_web_visitors_updated_at
BEFORE UPDATE ON public.web_visitors
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_web_visit_sessions_updated_at ON public.web_visit_sessions;
CREATE TRIGGER trg_web_visit_sessions_updated_at
BEFORE UPDATE ON public.web_visit_sessions
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_admin_configs_updated_at ON public.admin_configs;
CREATE TRIGGER trg_admin_configs_updated_at
BEFORE UPDATE ON public.admin_configs
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_contact_leads_updated_at ON public.contact_leads;
CREATE TRIGGER trg_contact_leads_updated_at
BEFORE UPDATE ON public.contact_leads
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_court_complexes_updated_at ON public.court_complexes;
CREATE TRIGGER trg_court_complexes_updated_at
BEFORE UPDATE ON public.court_complexes
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_courts_updated_at ON public.courts;
CREATE TRIGGER trg_courts_updated_at
BEFORE UPDATE ON public.courts
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_sessions_updated_at ON public.sessions;
CREATE TRIGGER trg_sessions_updated_at
BEFORE UPDATE ON public.sessions
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_sessions_set_ends_at ON public.sessions;
CREATE TRIGGER trg_sessions_set_ends_at
BEFORE INSERT OR UPDATE OF starts_at, duration_minutes ON public.sessions
FOR EACH ROW EXECUTE FUNCTION public.set_session_ends_at();

DROP TRIGGER IF EXISTS trg_pool_posts_updated_at ON public.pool_posts;
CREATE TRIGGER trg_pool_posts_updated_at
BEFORE UPDATE ON public.pool_posts
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_owner_post_quotas_updated_at ON public.owner_post_quotas;
CREATE TRIGGER trg_owner_post_quotas_updated_at
BEFORE UPDATE ON public.owner_post_quotas
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_bookings_updated_at ON public.bookings;
CREATE TRIGGER trg_bookings_updated_at
BEFORE UPDATE ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_bookings_validate_row ON public.bookings;
CREATE TRIGGER trg_bookings_validate_row
BEFORE INSERT OR UPDATE ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.validate_booking_row();

DROP TRIGGER IF EXISTS trg_payments_updated_at ON public.payment_transactions;
CREATE TRIGGER trg_payments_updated_at
BEFORE UPDATE ON public.payment_transactions
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_checkins_validate_row ON public.checkins;
CREATE TRIGGER trg_checkins_validate_row
BEFORE INSERT ON public.checkins
FOR EACH ROW EXECUTE FUNCTION public.validate_checkin_row();

DROP TRIGGER IF EXISTS trg_checkins_apply_side_effects ON public.checkins;
CREATE TRIGGER trg_checkins_apply_side_effects
AFTER INSERT ON public.checkins
FOR EACH ROW EXECUTE FUNCTION public.apply_checkin_side_effects();

DROP TRIGGER IF EXISTS trg_player_assessments_updated_at ON public.player_assessments;
CREATE TRIGGER trg_player_assessments_updated_at
BEFORE UPDATE ON public.player_assessments
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_video_assessments_updated_at ON public.video_assessments;
CREATE TRIGGER trg_video_assessments_updated_at
BEFORE UPDATE ON public.video_assessments
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_elo_ratings_updated_at ON public.elo_ratings;
CREATE TRIGGER trg_elo_ratings_updated_at
BEFORE UPDATE ON public.elo_ratings
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_match_events_updated_at ON public.match_events;
CREATE TRIGGER trg_match_events_updated_at
BEFORE UPDATE ON public.match_events
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_match_feedback_validate_row ON public.match_feedback;
CREATE TRIGGER trg_match_feedback_validate_row
BEFORE INSERT OR UPDATE ON public.match_feedback
FOR EACH ROW EXECUTE FUNCTION public.validate_match_feedback_row();

DROP TRIGGER IF EXISTS trg_chat_rooms_updated_at ON public.chat_rooms;
CREATE TRIGGER trg_chat_rooms_updated_at
BEFORE UPDATE ON public.chat_rooms
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_chat_rooms_validate_row ON public.chat_rooms;
CREATE TRIGGER trg_chat_rooms_validate_row
BEFORE INSERT OR UPDATE ON public.chat_rooms
FOR EACH ROW EXECUTE FUNCTION public.validate_chat_room_row();

DROP TRIGGER IF EXISTS trg_chat_room_members_validate_row ON public.chat_room_members;
CREATE TRIGGER trg_chat_room_members_validate_row
BEFORE INSERT OR UPDATE ON public.chat_room_members
FOR EACH ROW EXECUTE FUNCTION public.validate_chat_member_row();

DROP TRIGGER IF EXISTS trg_chat_messages_validate_row ON public.chat_messages;
CREATE TRIGGER trg_chat_messages_validate_row
BEFORE INSERT ON public.chat_messages
FOR EACH ROW EXECUTE FUNCTION public.validate_chat_message_row();

-- Useful indexes
CREATE INDEX IF NOT EXISTS idx_oauth_user_id ON public.oauth_identities(user_id);
CREATE INDEX IF NOT EXISTS idx_web_visitors_user ON public.web_visitors(user_id)
WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_web_visitors_first_seen ON public.web_visitors(first_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_web_visit_sessions_started ON public.web_visit_sessions(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_web_visit_sessions_visitor_started
ON public.web_visit_sessions(visitor_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_web_visit_sessions_user_seen
ON public.web_visit_sessions(user_id, last_seen_at DESC)
WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_owner_requests_status ON public.owner_service_requests(status, submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_contact_leads_status_created ON public.contact_leads(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_contact_leads_email_created ON public.contact_leads(email, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_court_complexes_owner ON public.court_complexes(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_courts_owner ON public.courts(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_courts_sport_status ON public.courts(sport, status);

CREATE INDEX IF NOT EXISTS idx_sessions_court_start_status ON public.sessions(court_id, starts_at, status);
CREATE INDEX IF NOT EXISTS idx_sessions_post_type_start ON public.sessions(post_type, starts_at);
CREATE INDEX IF NOT EXISTS idx_sessions_open_slots ON public.sessions(open_slots) WHERE open_slots > 0;

CREATE INDEX IF NOT EXISTS idx_pool_posts_host_status ON public.pool_posts(host_user_id, status);
CREATE INDEX IF NOT EXISTS idx_owner_post_quotas_limits ON public.owner_post_quotas(rental_post_limit, slot_post_limit);

CREATE INDEX IF NOT EXISTS idx_bookings_session_status ON public.bookings(session_id, status);
CREATE INDEX IF NOT EXISTS idx_bookings_player_created ON public.bookings(player_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bookings_code ON public.bookings(booking_code);

CREATE INDEX IF NOT EXISTS idx_payment_booking_kind_status ON public.payment_transactions(booking_id, kind, status);
CREATE INDEX IF NOT EXISTS idx_payment_external_ref ON public.payment_transactions(external_ref);

CREATE INDEX IF NOT EXISTS idx_checkins_owner_time ON public.checkins(owner_user_id, checked_in_at DESC);

CREATE INDEX IF NOT EXISTS idx_assessments_player_sport ON public.player_assessments(player_user_id, sport);
CREATE INDEX IF NOT EXISTS idx_video_assessments_player_time ON public.video_assessments(player_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_video_assessments_status_time ON public.video_assessments(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_match_events_session ON public.match_events(session_id);
CREATE INDEX IF NOT EXISTS idx_match_participants_match ON public.match_participants(match_id);
CREATE INDEX IF NOT EXISTS idx_match_feedback_match ON public.match_feedback(match_id);
CREATE INDEX IF NOT EXISTS idx_elo_history_player_time ON public.elo_rating_history(player_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_chat_rooms_pool ON public.chat_rooms(pool_post_id);
CREATE INDEX IF NOT EXISTS idx_chat_members_room_active ON public.chat_room_members(room_id) WHERE left_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_chat_messages_room_time ON public.chat_messages(room_id, created_at);

CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_time ON public.audit_logs(actor_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON public.audit_logs(entity_type, entity_id);
