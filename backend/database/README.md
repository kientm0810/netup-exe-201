# NetUp PostgreSQL Design

## Scope
Schema nay duoc thiet ke theo `business.md` cho tong the nghiep vu:
1. Auth + RBAC (Google login, local owner account duoc admin cap, owner duyet boi admin).
2. Court/session/booking/payment/check-in.
3. Ban hang tai quay (nuoc, cau), ton kho va hoa don gan voi player.
4. Pool group chat.
5. Match result + peer feedback + Elo history.

`schema.sql` la schema base. Migration `0016_owner_commerce` bo sung cac bang
local credential, hang hoa, hoa don va inventory movement; can chay Alembic den
`head` de co day du scope ben duoi.

## Design Principles
1. Constraint-first: rang buoc nghiep vu quan trong dat o DB (overlap, uniqueness, lifecycle coherence).
2. Audit-friendly: luu lich su role assignment, payment transaction, elo updates.
3. Extensible: de mo rong dynamic pricing, campaign, wallet sau nay ma khong pha schema core.

## Key Invariants Enforced at DB
1. Khong trung slot tren cung 1 san trong cac trang thai active.
2. Booking solo/full_court ton tai trong gioi han slot.
3. Payment deposit bat buoc cho moi booking.
4. Booking cash chi duoc check-in neu da thu phan con lai tai san.
5. Moi cap nguoi dung feedback nhau toi da 1 lan/match.
6. Moi pool post co toi da 1 chat room.

## Notes for Backend Implementation
1. Dung transaction khi tao booking + payment transaction.
2. Dung advisory lock hoac serialized transaction cho booking de tranh race condition slot.
3. Webhook VNPay phai idempotent theo `provider_transaction_id` + `external_ref`.
4. Elo engine cap nhat qua service layer, ghi vao `elo_rating_history`.
5. Tao hoa don tai quay phai lock row san pham, tru ton kho va ghi
   `inventory_movements` trong cung transaction. Player bill API phai loc theo
   `customer_user_id`, khong chi theo ID hoa don.
