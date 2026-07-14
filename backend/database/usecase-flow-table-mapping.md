# NetUp Usecase Flow -> Database Table Mapping

## 1) Tong quan
- Nguon business: `business.md`
- Nguon schema: `backend/database/schema.sql`
- Muc tieu file nay:
  - Mapping tung use case flow voi bang du lieu.
  - Kiem tra do phu nghiep vu so voi schema hien tai.

Quy uoc coverage:
- `Covered`: Da co bang + rang buoc/chot logic o DB.
- `Partial`: Da co bang, nhung can chot them o service/API hoac policy.
- `Gap`: Chua thay mo hinh ro rang o schema.

## 2) Mapping theo use case

| UC ID | Use case | Bang chinh | Bang ho tro | Coverage | Ghi chu |
|---|---|---|---|---|---|
| UC-PL-01 | Player login Google + tao profile | `users`, `oauth_identities` | `audit_logs` | Covered | OAuth identity da unique theo provider/provider_user_id |
| UC-PL-02 | Onboarding assessment -> khoi tao Elo | `player_assessments`, `video_assessments`, `elo_ratings` | `elo_rating_history` | Covered | Ho tro video job Gemini, ket qua normalized va current elo/history |
| UC-PL-03 | Discovery list/map session | `sessions`, `courts`, `court_complexes` | `pool_posts`, `elo_ratings` | Covered | Du lieu filter map/list day du |
| UC-PL-04 | Tao pool post | `pool_posts`, `sessions` | `player_assessments`, `bookings` | Partial | Rule "phai co assessment" can enforce tai service/API |
| UC-PL-05 | Join pool (solo booking) | `bookings` | `sessions`, `payment_transactions` | Partial | Da validate seats; can them anti-race lock o service |
| UC-PL-06 | Thue nguyen san (full-court booking) | `bookings` | `sessions`, `payment_transactions` | Partial | Da validate full_court = max_slots; can lock tranh overbook |
| UC-PL-07 | Thanh toan VNPay / cash with deposit | `payment_transactions`, `bookings` | `admin_configs`, `checkins` | Covered | Da co deposit/remaining/refund + method rule |
| UC-PL-08 | Nhan booking code/QR va check-in | `bookings`, `checkins` | `payment_transactions` | Covered | Trigger checkin cap nhat booking + tao cash txn |
| UC-PL-09 | Sau tran: ket qua + feedback | `match_events`, `match_participants`, `match_feedback` | `elo_ratings`, `elo_rating_history` | Partial | Elo algorithm update can lam o service |
| UC-PL-10 | Xem lich su booking/payment/match/feedback | `bookings`, `payment_transactions`, `match_events`, `match_feedback` | `elo_rating_history` | Covered | Du lieu lich su da co |
| UC-CH-01 | Pool host tao group chat | `chat_rooms` | `pool_posts`, `sessions` | Covered | Trigger buoc host va session phai match pool |
| UC-CH-02 | Member join chat room pool | `chat_room_members` | `bookings`, `pool_posts`, `chat_rooms` | Covered | Trigger validate host hoac booking active |
| UC-CH-03 | Gui tin nhan trong room | `chat_messages` | `chat_room_members` | Covered | Trigger check sender la member active |
| UC-OW-01 | Owner gui request dich vu | `owner_service_requests` | `users` | Covered | 1 pending request/user |
| UC-OW-02 | Admin duyet owner + gan role | `owner_service_requests`, `user_role_assignments` | `users`, `audit_logs` | Covered | Da co lich su role assignment |
| UC-OW-03 | Owner quan ly san/cum san | `court_complexes`, `courts`, `sessions` | `audit_logs` | Covered | Inventory va session model day du |
| UC-OW-04 | Owner cap nhat gioi han thue | `courts` | `audit_logs` | Covered | `max_rental_duration_minutes` da constraint |
| UC-OW-05 | Owner check-in booking | `checkins`, `bookings` | `payment_transactions`, `courts` | Covered | Trigger enforce owner dung san + cash due |
| UC-AD-01 | Admin cap nhat config he thong | `admin_configs` | `audit_logs` | Covered | Da co table singleton config |
| UC-AD-02 | Admin dashboard van hanh + tang truong user | `web_visitors`, `web_visit_sessions`, `users` | `bookings`, `sessions`, `payment_transactions`, `owner_service_requests` | Covered | Traffic that duoc track theo visitor/session; 5 KPI va daily series duoc aggregate tai API |

## 3) Flow chi tiet theo nhom

### 3.1 Auth + Role flow
1. Google callback:
- Write: `users` (insert/update), `oauth_identities` (upsert)
- Optional write: `audit_logs`
2. Owner onboarding:
- Write: `owner_service_requests`
3. Admin approve owner:
- Update: `owner_service_requests.status`
- Insert: `user_role_assignments` (role=`owner`, revoked_at NULL)
- Insert: `audit_logs`

### 3.2 Pool booking flow (core)
1. Player tao pool:
- Read: `player_assessments`, `sessions`
- Write: `pool_posts`
- Update: `sessions` (post_type/allows_solo_join neu can)
2. Player join pool:
- Read: `sessions`, `pool_posts`, `admin_configs`
- Write: `bookings`
- Write: `payment_transactions` (deposit)
- Update: `bookings.status` theo payment callback
3. Owner check-in:
- Write: `checkins`
- Trigger side effects:
  - Update `bookings.status = checked_in`
  - Insert `payment_transactions` (remaining-cash neu co)

### 3.3 Rental flow (core)
1. Tao session rental:
- Write: `sessions` (co exclusion constraint no-overlap)
2. Booking full-court:
- Read: `sessions`, `admin_configs`
- Write: `bookings`, `payment_transactions`
3. Check-in + settle:
- Giong flow pool o phan checkin

### 3.4 Elo + match feedback flow
1. Onboarding assessment:
- Write: `player_assessments` tu form onboarding ban dau
- Upsert: `elo_ratings`
- Insert: `elo_rating_history` (reason=assessment_onboarding)
2. Video reassessment:
- Write: `video_assessments` (upload/analyzing/completed/failed)
- Upsert: `elo_ratings`
- Insert: `elo_rating_history` (reason=video_reassessment, hoac video_assessment_initial neu chua co assessment legacy)
3. Sau tran:
- Write: `match_events`, `match_participants`
- Write: `match_feedback`
- Service tinh Elo:
  - Update: `elo_ratings`
  - Insert: `elo_rating_history`

### 3.5 Pool group chat flow
1. Tao room:
- Write: `chat_rooms` (trigger check host/session)
2. Join room:
- Write: `chat_room_members` (trigger check eligibility)
3. Send message:
- Write: `chat_messages` (trigger check active membership)
4. Dong room:
- Update: `chat_rooms.status`, `chat_rooms.closed_at`
- Optional update: `chat_room_members.left_at`

## 4) Rule-to-Table Mapping

| Business rule | Bang / co che dang bao dam |
|---|---|
| Owner chi active sau duyet admin | `owner_service_requests`, `user_role_assignments` |
| Session cung san khong trung gio | `sessions` + exclusion constraint `sessions_no_overlap_per_court` |
| Solo 1..2 slot, full-court = max_slots | `bookings` + trigger `validate_booking_row` |
| Bat buoc coc online | `bookings.deposit_required_vnd` + `payment_transactions` rule kind/method |
| Cash phai thu phan con lai khi check-in | `checkins` trigger `validate_checkin_row` |
| Group chat chi pool host tao | `chat_rooms` trigger `validate_chat_room_row` |
| Chi member hop le moi vao chat | `chat_room_members` trigger `validate_chat_member_row` |
| Feedback khong self + dung teammate/opponent | `match_feedback` constraints + trigger `validate_match_feedback_row` |
| Luu lich su bien dong Elo | `elo_rating_history` |
| Form onboarding chi tao Elo ban dau mot lan | `player_assessments` unique + service check |
| Video AI co the danh gia lai sau onboarding | `video_assessments` partial unique chi chan uploaded/analyzing |

## 5) Coverage ket luan

### 5.1 Da dap ung tot
1. Core data model cho auth/role, booking/payment/check-in.
2. Pool chat model theo host.
3. Match/feedback/Elo history model.
4. Constraint quan trong da dat o DB layer.

### 5.2 Partial (can chot o backend service)
1. Rule "tao pool bat buoc co assessment".
2. Chien luoc lock transaction khi booking de tranh race condition slot.
3. State machine chi tiet cho booking/payment (transition hop le theo tung event).
4. Elo algorithm formula va trong so feedback.
5. Policy dong room chat khi session ket thuc.

### 5.3 Gap
- Khong co gap schema nghiem trong theo scope business hien tai.
- Cac muc tam bo (wallet, abuse automation, push by area) chua model la dung theo scope da chot.

## 6) Checklist review nhanh cho ban
1. Ban co muon `match_events` luu them loai tran (don, doi, tournament) ngay tu dau khong?
2. Ban co muon tach bang `pool_members` rieng (ngoai booking) de theo doi invite/pending/left chi tiet hon khong?
3. Ban co muon bo sung field policy cho chat room (`auto_close_after_minutes`, `archived_by`) ngay trong schema khong?

Neu 3 diem tren giu nhu hien tai, schema da san sang cho buoc tiep theo: API contract va migration/Alembic.
