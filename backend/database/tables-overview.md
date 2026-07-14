# NetUp Database Tables Overview

## Tong quan
- Nguon schema: `backend/database/schema.sql`
- Tong so bang trong schema goc: **27**

Danh sach bang:
1. `users`
2. `oauth_identities`
3. `user_role_assignments`
4. `web_visitors`
5. `web_visit_sessions`
6. `owner_service_requests`
7. `contact_leads`
8. `admin_configs`
9. `court_complexes`
10. `courts`
11. `sessions`
12. `pool_posts`
13. `owner_post_quotas`
14. `bookings`
15. `payment_transactions`
16. `checkins`
17. `player_assessments`
18. `video_assessments`
19. `elo_ratings`
20. `match_events`
21. `match_participants`
22. `match_feedback`
23. `elo_rating_history`
24. `chat_rooms`
25. `chat_room_members`
26. `chat_messages`
27. `audit_logs`

## 1) User, Auth, Role

### `users`
- Muc dich: Thong tin user goc trong he thong.
- Primary key: `id`.
- Cot chinh:
  - `email` (unique), `full_name`, `avatar_url`, `phone`.
  - `city`, `district`, `is_active`.
  - `created_at`, `updated_at`.
- Quan he:
  - 1-n voi `oauth_identities`, `user_role_assignments`, `owner_service_requests`.
  - Duoc reference boi booking, checkin, chat, match, audit.

### `oauth_identities`
- Muc dich: Luu lien ket OAuth (Google) cho user.
- Primary key: `id`.
- Foreign key: `user_id -> users.id`.
- Cot chinh:
  - `provider` (chi cho phep `google`), `provider_user_id`.
  - `provider_email`, `provider_payload`, `last_login_at`.
- Rang buoc unique:
  - `(provider, provider_user_id)`.
  - `(user_id, provider)`.

### `user_role_assignments`
- Muc dich: Lich su gan/thu hoi role (player/owner/admin).
- Primary key: `id`.
- Foreign key:
  - `user_id -> users.id`.
  - `granted_by -> users.id`.
- Cot chinh:
  - `role`, `granted_at`, `revoked_at`, `reason`.
- Rang buoc:
  - `revoked_at` phai >= `granted_at` neu co gia tri.
  - Unique partial index role dang active: `(user_id, role) WHERE revoked_at IS NULL`.

### `owner_service_requests`
- Muc dich: Don dang ky dich vu owner.
- Primary key: `id`.
- Foreign key:
  - `user_id -> users.id`.
  - `reviewed_by -> users.id`.
- Cot chinh:
  - `business_name`, `contact_phone`, `facility_overview`.
  - `status` (pending/approved/rejected/cancelled).
  - `submitted_at`, `reviewed_at`, `review_note`.
- Rang buoc:
  - 1 user chi co 1 don `pending` tai 1 thoi diem (partial unique index).

### `admin_configs`
- Muc dich: Cau hinh nghiep vu global cho he thong.
- Primary key: `id` (co dinh = 1).
- Cot chinh:
  - `platform_fee_rate`, `floor_fee_vnd`, `deposit_percent`.
  - `matching_radius_km`, `no_show_strike_limit`, `auto_release_minutes`.
  - `video_assessment_max_size_mb`, `video_assessment_max_duration_seconds`.
  - `support_hotline_enabled`, `updated_at`.

### `web_visitors`
- Muc dich: Dinh danh mot trinh duyet lau dai bang random `visitor_key`.
- Foreign key tuy chon: `user_id -> users.id` khi visitor da dang nhap.
- Cot chinh: `first_seen_at`, `last_seen_at`, `created_at`, `updated_at`.
- Rang buoc: `visitor_key` unique; khong luu IP hay du lieu fingerprint nhay cam.

### `web_visit_sessions`
- Muc dich: Moi row la mot luot truy cap website; frontend xoay `session_key`
  sau 30 phut khong hoat dong.
- Foreign key: `visitor_id -> web_visitors.id`; `user_id -> users.id` tuy chon.
- Cot chinh: `entry_path`, `last_path`, `page_view_count`, `source`,
  `started_at`, `last_seen_at`.
- Rang buoc: `session_key` unique, nen goi lai trong cung phien chi tang page view,
  khong lam tang tong luot truy cap.
- `source=seed` la lich su khoi tao theo user; `source=web` la traffic that.

## 2) Court Inventory va Session

### `court_complexes`
- Muc dich: Cum san (khu san) cua owner.
- Primary key: `id`.
- Foreign key: `owner_user_id -> users.id`.
- Cot chinh:
  - `name`, `district`, `address`.
  - `latitude`, `longitude`.
  - `created_at`, `updated_at`.
- Rang buoc:
  - Unique `(owner_user_id, name)`.

### `courts`
- Muc dich: San nho thuoc 1 cum san.
- Primary key: `id`.
- Foreign key:
  - `complex_id -> court_complexes.id`.
  - `owner_user_id -> users.id`.
- Cot chinh:
  - `name`, `sub_court_name`, `sport`, `status`.
  - `rating`, `amenities`, `base_price_vnd`.
  - `max_rental_duration_minutes`.
  - `created_at`, `updated_at`.
- Rang buoc:
  - Unique `(complex_id, sub_court_name)`.
  - Duration chi cho phep cac moc 30/60/.../300.

### `sessions`
- Muc dich: Khung gio dat san (pool/rental).
- Primary key: `id`.
- Foreign key:
  - `court_id -> courts.id`.
  - `created_by_user_id -> users.id`.
- Cot chinh:
  - `title`, `post_type`, `status`.
  - `starts_at`, `duration_minutes`, `ends_at`.
  - `open_slots`, `max_slots`.
  - `required_skill_min`, `required_skill_max`.
  - `slot_price_vnd`, `full_court_price_vnd`.
  - `is_peak_hour`, `allows_solo_join`.
  - `created_at`, `updated_at`.
- Rang buoc:
  - `open_slots <= max_slots`.
  - Muc skill min <= max.
  - Exclusion constraint: khong cho overlap tren cung `court_id` voi session status active.
- Trigger:
  - Tu dong tinh `ends_at` tu `starts_at + duration_minutes`.

### `pool_posts`
- Muc dich: Bai dang keo cho ghep gan voi 1 session.
- Primary key: `id`.
- Foreign key:
  - `session_id -> sessions.id` (unique 1-1).
  - `host_user_id -> users.id`.
- Cot chinh:
  - `status`, `total_slots`, `host_slots`, `description`.
  - `created_at`, `updated_at`.
- Rang buoc:
  - `total_slots >= 2`, `host_slots >= 1`, `host_slots <= total_slots`.

## 3) Booking, Payment, Check-in

### `bookings`
- Muc dich: Ban ghi dat san cua player.
- Primary key: `id`.
- Foreign key:
  - `session_id -> sessions.id`.
  - `court_id -> courts.id`.
  - `player_user_id -> users.id`.
- Cot chinh:
  - `booking_code` (unique), `mode`, `status`, `payment_method`.
  - `seats_booked`, `base_price_vnd`, `floor_fee_vnd`, `platform_fee_vnd`, `total_price_vnd`.
  - `deposit_required_vnd`, `remaining_due_vnd`.
  - `qr_payload`.
  - `checked_in_at`, `completed_at`, `cancelled_at`, `cancel_reason`.
  - `created_at`, `updated_at`.
- Rang buoc:
  - `deposit_required_vnd + remaining_due_vnd = total_price_vnd`.
  - Solo cho phep 1..2 slot.
  - Partial unique: 1 player khong co booking active trung session.
- Trigger:
  - Validate `court_id` khop `session.court_id`.
  - Validate `full_court` phai booking dung `max_slots`.

### `payment_transactions`
- Muc dich: Luu giao dich thanh toan (coc, phan con lai, refund).
- Primary key: `id`.
- Foreign key: `booking_id -> bookings.id`.
- Cot chinh:
  - `kind` (deposit/remaining/refund), `method` (vnpay/cash).
  - `provider`, `provider_transaction_id`, `external_ref`.
  - `amount_vnd`, `status`, `metadata`.
  - `requested_at`, `paid_at`, `failed_at`, `expires_at`.
  - `created_at`, `updated_at`.
- Rang buoc:
  - `deposit` bat buoc `vnpay`.
  - `remaining` co the `vnpay` hoac `cash`.
  - `refund` chi `vnpay`.
  - Neu `method=vnpay` thi `provider` phai co.
  - Unique provider txn id (partial unique index).

### `checkins`
- Muc dich: Ban ghi check-in tai san.
- Primary key: `id`.
- Foreign key:
  - `booking_id -> bookings.id` (unique).
  - `owner_user_id -> users.id`.
- Cot chinh:
  - `checkin_method` (booking_code/qr).
  - `cash_collected_vnd`, `note`, `checked_in_at`, `created_at`.
- Trigger:
  - Validate owner phai la chu san cua booking.
  - Validate booking status hop le de check-in.
  - Neu booking cash thi `cash_collected_vnd` phai du >= `remaining_due_vnd`.
  - Sau insert: auto cap nhat `bookings.status = checked_in`.
  - Sau insert: auto tao payment transaction cho khoan thu cash remaining.

## 4) Assessment, Match, Elo

### `player_assessments`
- Muc dich: Ban ghi assessment da chot de khoi tao Elo ban dau.
- Primary key: `id`.
- Foreign key: `player_user_id -> users.id`.
- Cot chinh:
  - `sport`, `form_version`, `answers` (jsonb).
  - `computed_elo`, `computed_skill_tier`.
  - `created_at`, `updated_at`.
- Rang buoc:
  - Unique `(player_user_id, sport)`.
  - `computed_elo` trong [100..5000].

### `video_assessments`
- Muc dich: Job upload video va ket qua Gemini de danh gia lai player hoac khoi tao Elo neu chua onboard.
- Primary key: `id`.
- Foreign key: `player_user_id -> users.id`.
- Cot chinh:
  - `sport`, `storage_key`, `original_filename`, `mime_type`.
  - `file_size_bytes`, `duration_seconds`, `status`.
  - `llm_provider`, `llm_model`, `llm_raw_response`, `normalized_result`.
  - `computed_elo`, `computed_skill_tier`, `confidence`, `error_message`.
  - `created_at`, `updated_at`.
- Rang buoc:
  - `status` chi gom uploaded/analyzing/completed/failed.
  - Partial unique moi player chi co 1 job active uploaded/analyzing.

### `elo_ratings`
- Muc dich: Diem Elo hien tai cua moi player.
- Primary key + foreign key: `player_user_id -> users.id`.
- Cot chinh:
  - `elo_value`, `visible_skill_tier`.
  - `matches_played`, `wins`, `losses`, `draws`.
  - `updated_at`.

### `match_events`
- Muc dich: Tran dau phat sinh tu 1 session.
- Primary key: `id`.
- Foreign key:
  - `session_id -> sessions.id` (unique 1-1).
  - `recorded_by_user_id -> users.id`.
- Cot chinh:
  - `status`, `team_a_score`, `team_b_score`.
  - `started_at`, `ended_at`, `finalized_at`.
  - `created_at`, `updated_at`.

### `match_participants`
- Muc dich: Thanh vien tham gia tran dau.
- Primary key: `id`.
- Foreign key:
  - `match_id -> match_events.id`.
  - `booking_id -> bookings.id`.
  - `player_user_id -> users.id`.
- Cot chinh:
  - `team_side` (1/2), `result` (win/loss/draw/void), `created_at`.
- Rang buoc unique:
  - `(match_id, player_user_id)`.
  - `(match_id, booking_id)`.

### `match_feedback`
- Muc dich: Feedback hau tran giua cac player cung match.
- Primary key: `id`.
- Foreign key:
  - `match_id -> match_events.id`.
  - `from_user_id -> users.id`.
  - `to_user_id -> users.id`.
- Cot chinh:
  - `target_type` (teammate/opponent), `rating` (1..5), `comment`, `created_at`.
- Rang buoc:
  - Unique `(match_id, from_user_id, to_user_id)`.
  - `from_user_id <> to_user_id`.
- Trigger:
  - Validate 2 user deu la participant cua match.
  - Validate teammate/opponent dung theo `team_side`.

### `elo_rating_history`
- Muc dich: Lich su bien dong Elo de audit.
- Primary key: `id`.
- Foreign key:
  - `player_user_id -> users.id`.
  - `match_id -> match_events.id`.
- Cot chinh:
  - `old_elo`, `new_elo`, `delta`.
  - `reason`, `algorithm_version`, `created_at`.

## 5) Pool Group Chat

### `chat_rooms`
- Muc dich: Room chat cua pool.
- Primary key: `id`.
- Foreign key:
  - `pool_post_id -> pool_posts.id` (unique 1-1).
  - `session_id -> sessions.id`.
  - `created_by_user_id -> users.id`.
- Cot chinh:
  - `status`, `closed_at`, `created_at`, `updated_at`.
- Trigger:
  - Validate room phai match cung `session_id` voi pool.
  - Validate chi pool host moi duoc tao room.

### `chat_room_members`
- Muc dich: Thanh vien trong room chat.
- Primary key: `id`.
- Foreign key:
  - `room_id -> chat_rooms.id`.
  - `user_id -> users.id`.
- Cot chinh:
  - `role` (host/member/moderator), `joined_at`, `left_at`.
- Rang buoc:
  - Unique `(room_id, user_id)`.
- Trigger:
  - User chi duoc join neu la pool host hoac co booking active trong session cua room.

### `chat_messages`
- Muc dich: Tin nhan trong room.
- Primary key: `id`.
- Foreign key:
  - `room_id -> chat_rooms.id`.
  - `sender_user_id -> users.id`.
- Cot chinh:
  - `message_type`, `content`, `metadata`.
  - `created_at`, `edited_at`, `deleted_at`.
- Trigger:
  - Validate sender dang la thanh vien active cua room.

## 6) Audit

### `audit_logs`
- Muc dich: Nhat ky hanh dong quan tri/he thong.
- Primary key: `id`.
- Foreign key: `actor_user_id -> users.id`.
- Cot chinh:
  - `event_type`, `entity_type`, `entity_id`, `payload`, `created_at`.

## 7) Trigger va index noi bat
- Trigger chinh:
  - `set_updated_at` cho nhieu bang co `updated_at`.
  - `set_session_ends_at` cho `sessions`.
  - `validate_booking_row`, `validate_checkin_row`, `apply_checkin_side_effects`.
  - `validate_chat_room_row`, `validate_chat_member_row`, `validate_chat_message_row`.
  - `validate_match_feedback_row`.
- Index chinh:
  - Role active (`ux_user_role_active`).
  - Owner request pending (`ux_owner_request_pending_per_user`).
  - Booking active/user/session (`ux_booking_active_user_session`).
  - VNPay transaction uniqueness (`ux_payment_provider_txn`).
  - Session/court/time va open slots.
  - Chat room/member/message lookup.
  - Elo history, feedback, audit lookup.
