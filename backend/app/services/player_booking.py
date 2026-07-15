from __future__ import annotations

from datetime import UTC, datetime, timedelta
from decimal import ROUND_HALF_UP, Decimal
from secrets import token_hex
from typing import Any

from psycopg.types.json import Jsonb
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

from app.core.errors import AppError
from app.db.session import get_engine

SESSION_DISCOVERY_STATUSES = {"scheduled", "locked"}
SKILL_RANKS = {"Beginner": 1, "Intermediate": 2, "Advanced": 3}


def _round_money(value: Decimal) -> int:
    return int(value.quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def _expire_overdue_deposit_bookings(
    connection: Any, *, player_user_id: str, session_id: str | None = None
) -> None:
    params: dict[str, Any] = {"player_user_id": player_user_id}
    session_filter = ""
    if session_id is not None:
        session_filter = "AND b.session_id = :session_id"
        params["session_id"] = session_id

    rows = connection.execute(
        text(
            f"""
            SELECT
              b.id,
              b.session_id,
              b.seats_booked,
              s.open_slots,
              s.max_slots,
              s.status::text AS session_status
            FROM public.bookings b
            JOIN public.sessions s ON s.id = b.session_id
            JOIN public.payment_transactions pt ON pt.booking_id = b.id
            WHERE b.player_user_id = :player_user_id
              AND b.status = CAST('awaiting_deposit' AS public.booking_status)
              AND pt.kind = CAST('deposit' AS public.payment_transaction_kind)
              AND pt.status <> CAST('paid' AS public.payment_status)
              AND pt.expires_at IS NOT NULL
              AND pt.expires_at <= now()
              {session_filter}
            FOR UPDATE OF b, s
            """
        ),
        params,
    ).all()

    for row in rows:
        connection.execute(
            text(
                """
                UPDATE public.payment_transactions
                SET status = CAST('expired' AS public.payment_status),
                    expires_at = COALESCE(expires_at, now())
                WHERE booking_id = :booking_id
                  AND kind = CAST('deposit' AS public.payment_transaction_kind)
                  AND status <> CAST('paid' AS public.payment_status)
                """
            ),
            {"booking_id": str(row.id)},
        )
        connection.execute(
            text(
                """
                UPDATE public.bookings
                SET status = CAST('expired' AS public.booking_status),
                    cancelled_at = now(),
                    cancel_reason = 'Deposit payment expired'
                WHERE id = :booking_id
                  AND status = CAST('awaiting_deposit' AS public.booking_status)
                """
            ),
            {"booking_id": str(row.id)},
        )


def _expire_all_overdue_deposit_bookings(connection: Any) -> None:
    rows = connection.execute(
        text(
            """
            SELECT
              b.id,
              b.session_id,
              b.seats_booked,
              s.open_slots,
              s.max_slots,
              s.status::text AS session_status
            FROM public.bookings b
            JOIN public.sessions s ON s.id = b.session_id
            JOIN public.payment_transactions pt ON pt.booking_id = b.id
            WHERE b.status = CAST('awaiting_deposit' AS public.booking_status)
              AND pt.kind = CAST('deposit' AS public.payment_transaction_kind)
              AND pt.status <> CAST('paid' AS public.payment_status)
              AND pt.expires_at IS NOT NULL
              AND pt.expires_at <= now()
            FOR UPDATE OF b, s
            """
        )
    ).all()

    for row in rows:
        connection.execute(
            text(
                """
                UPDATE public.payment_transactions
                SET status = CAST('expired' AS public.payment_status),
                    expires_at = COALESCE(expires_at, now())
                WHERE booking_id = :booking_id
                  AND kind = CAST('deposit' AS public.payment_transaction_kind)
                  AND status <> CAST('paid' AS public.payment_status)
                """
            ),
            {"booking_id": str(row.id)},
        )
        connection.execute(
            text(
                """
                UPDATE public.bookings
                SET status = CAST('expired' AS public.booking_status),
                    cancelled_at = now(),
                    cancel_reason = 'Deposit payment expired'
                WHERE id = :booking_id
                  AND status = CAST('awaiting_deposit' AS public.booking_status)
                """
            ),
            {"booking_id": str(row.id)},
        )


def _session_from_row(row: Any) -> dict[str, Any]:
    return {
        "id": str(row.id),
        "court_id": str(row.court_id),
        "title": str(row.title),
        "description": str(row.description) if row.description else None,
        "post_type": str(row.post_type),
        "status": str(row.status),
        "image_url": str(row.image_url) if row.image_url else None,
        "starts_at": row.starts_at,
        "duration_minutes": int(row.duration_minutes),
        "ends_at": row.ends_at,
        "open_slots": int(row.open_slots),
        "max_slots": int(row.max_slots),
        "required_skill_min": str(row.required_skill_min),
        "required_skill_max": str(row.required_skill_max),
        "slot_price_vnd": int(row.slot_price_vnd),
        "full_court_price_vnd": int(row.full_court_price_vnd),
        "is_peak_hour": bool(row.is_peak_hour),
        "allows_solo_join": bool(row.allows_solo_join),
        "court_name": str(row.court_name),
        "sub_court_name": str(row.sub_court_name),
        "court_image_url": str(row.court_image_url) if row.court_image_url else None,
        "sport": str(row.sport),
        "amenities": list(row.amenities or []),
        "base_price_vnd": int(row.base_price_vnd),
        "min_rental_duration_minutes": int(row.min_rental_duration_minutes),
        "max_rental_duration_minutes": int(row.max_rental_duration_minutes),
        "complex_id": str(row.complex_id),
        "complex_name": str(row.complex_name),
        "district": str(row.district),
        "address": str(row.address),
        "latitude": float(row.latitude) if row.latitude is not None else None,
        "longitude": float(row.longitude) if row.longitude is not None else None,
        "pool_post_id": (
            str(row.pool_post_id)
            if hasattr(row, "pool_post_id") and row.pool_post_id is not None
            else None
        ),
        "player_skill_tier": (
            str(row.player_skill_tier)
            if hasattr(row, "player_skill_tier") and row.player_skill_tier is not None
            else None
        ),
        "recommendation_score": (
            int(row.recommendation_score)
            if hasattr(row, "recommendation_score") and row.recommendation_score is not None
            else None
        ),
        "recommendation_label": (
            str(row.recommendation_label)
            if hasattr(row, "recommendation_label") and row.recommendation_label is not None
            else None
        ),
        "distance_bucket": (
            str(row.distance_bucket)
            if hasattr(row, "distance_bucket") and row.distance_bucket is not None
            else None
        ),
        "slot_fit_score": (
            int(row.slot_fit_score)
            if hasattr(row, "slot_fit_score") and row.slot_fit_score is not None
            else None
        ),
        "joined_players": (
            list(row.joined_players)
            if hasattr(row, "joined_players") and row.joined_players is not None
            else []
        ),
    }


def _booking_from_row(row: Any) -> dict[str, Any]:
    return {
        "id": str(row.id),
        "booking_code": str(row.booking_code),
        "session_id": str(row.session_id),
        "court_id": str(row.court_id),
        "player_user_id": str(row.player_user_id),
        "mode": str(row.mode),
        "seats_booked": int(row.seats_booked),
        "status": str(row.status),
        "payment_method": str(row.payment_method),
        "base_price_vnd": int(row.base_price_vnd),
        "floor_fee_vnd": int(row.floor_fee_vnd),
        "platform_fee_vnd": int(row.platform_fee_vnd),
        "total_price_vnd": int(row.total_price_vnd),
        "deposit_required_vnd": int(row.deposit_required_vnd),
        "remaining_due_vnd": int(row.remaining_due_vnd),
        "qr_payload": str(row.qr_payload),
        "checked_in_at": row.checked_in_at,
        "completed_at": row.completed_at,
        "cancelled_at": row.cancelled_at,
        "cancel_reason": str(row.cancel_reason) if row.cancel_reason else None,
        "created_at": row.created_at,
        "updated_at": row.updated_at,
        "session_title": str(row.session_title) if row.session_title else None,
        "session_starts_at": row.session_starts_at if hasattr(row, "session_starts_at") else None,
        "session_allows_solo_join": bool(row.session_allows_solo_join) if hasattr(row, "session_allows_solo_join") else False,
        "complex_name": str(row.complex_name) if row.complex_name else None,
        "district": str(row.district) if row.district else None,
        "court_name": str(row.court_name) if row.court_name else None,
        "sub_court_name": str(row.sub_court_name) if row.sub_court_name else None,
        "sport": str(row.sport) if row.sport else None,
    }


def _audit(
    connection: Any,
    *,
    actor_user_id: str,
    event_type: str,
    entity_type: str,
    entity_id: str,
    payload: dict[str, Any] | None = None,
) -> None:
    connection.execute(
        text(
            """
            INSERT INTO public.audit_logs (
              actor_user_id,
              event_type,
              entity_type,
              entity_id,
              payload
            )
            VALUES (:actor_user_id, :event_type, :entity_type, :entity_id, :payload)
            """
        ),
        {
            "actor_user_id": actor_user_id,
            "event_type": event_type,
            "entity_type": entity_type,
            "entity_id": entity_id,
            "payload": Jsonb(payload or {}),
        },
    )


def _session_select_sql(where_clause: str) -> str:
    return f"""
        SELECT
          s.id,
          s.court_id,
          s.title,
          s.description,
          s.post_type::text AS post_type,
          s.status::text AS status,
          s.image_url,
          s.starts_at,
          s.duration_minutes,
          s.ends_at,
          s.open_slots,
          s.max_slots,
          s.required_skill_min::text AS required_skill_min,
          s.required_skill_max::text AS required_skill_max,
          s.slot_price_vnd,
          s.full_court_price_vnd,
          s.is_peak_hour,
          s.allows_solo_join,
          c.name AS court_name,
          c.sub_court_name,
          c.image_url AS court_image_url,
          c.sport::text AS sport,
          c.amenities,
          c.base_price_vnd,
          c.min_rental_duration_minutes,
          c.max_rental_duration_minutes,
          cc.id AS complex_id,
          cc.name AS complex_name,
          cc.district,
          cc.address,
          cc.latitude,
          cc.longitude,
          p.id AS pool_post_id,
          COALESCE(jp.joined_players, '[]'::jsonb) AS joined_players
        FROM public.sessions s
        JOIN public.courts c ON c.id = s.court_id
        JOIN public.court_complexes cc ON cc.id = c.complex_id
        LEFT JOIN public.pool_posts p ON p.session_id = s.id
        LEFT JOIN LATERAL (
          SELECT jsonb_agg(
            jsonb_build_object(
              'id', u.id::text,
              'full_name', u.full_name,
              'avatar_url', u.avatar_url,
              'city', u.city,
              'district', u.district,
              'visible_skill_tier', COALESCE(er.visible_skill_tier::text, 'Beginner'),
              'elo_value', COALESCE(er.elo_value, 1000),
              'matches_played', COALESCE(er.matches_played, 0),
              'wins', COALESCE(er.wins, 0),
              'losses', COALESCE(er.losses, 0),
              'draws', COALESCE(er.draws, 0)
            )
            ORDER BY participant.created_at
          ) AS joined_players
          FROM (
            SELECT DISTINCT ON (raw_participant.user_id)
              raw_participant.user_id,
              raw_participant.created_at
            FROM (
              SELECT
                u.id AS user_id,
                p.created_at
              FROM public.pool_posts p
              JOIN public.users u ON u.id = p.host_user_id
              WHERE p.session_id = s.id

              UNION ALL

              SELECT
                u.id AS user_id,
                b.created_at
              FROM public.bookings b
              JOIN public.users u ON u.id = b.player_user_id
              WHERE b.session_id = s.id
                AND b.status NOT IN (
                  CAST('cancelled' AS public.booking_status),
                  CAST('expired' AS public.booking_status)
                )
            ) raw_participant
            ORDER BY raw_participant.user_id, raw_participant.created_at
          ) participant
          JOIN public.users u ON u.id = participant.user_id
          LEFT JOIN public.elo_ratings er ON er.player_user_id = u.id
        ) jp ON TRUE
        {where_clause}
    """


def _load_player_tier(connection: Any, *, player_user_id: str) -> str:
    rating_row = connection.execute(
        text(
            """
            SELECT visible_skill_tier::text AS visible_skill_tier
            FROM public.elo_ratings
            WHERE player_user_id = :player_user_id
            LIMIT 1
            """
        ),
        {"player_user_id": player_user_id},
    ).first()
    if rating_row is not None:
        return str(rating_row.visible_skill_tier)

    assessment_row = connection.execute(
        text(
            """
            SELECT computed_skill_tier::text AS computed_skill_tier
            FROM public.player_assessments
            WHERE player_user_id = :player_user_id
            ORDER BY updated_at DESC
            LIMIT 1
            """
        ),
        {"player_user_id": player_user_id},
    ).first()
    if assessment_row is not None:
        return str(assessment_row.computed_skill_tier)
    return "Beginner"


def _load_player_preferred_district(connection: Any, *, player_user_id: str) -> str | None:
    row = connection.execute(
        text(
            """
            SELECT cc.district
            FROM public.bookings b
            JOIN public.sessions s ON s.id = b.session_id
            JOIN public.courts c ON c.id = s.court_id
            JOIN public.court_complexes cc ON cc.id = c.complex_id
            WHERE b.player_user_id = :player_user_id
            ORDER BY b.created_at DESC
            LIMIT 1
            """
        ),
        {"player_user_id": player_user_id},
    ).first()
    if row is None or row.district is None:
        return None
    return str(row.district)


def _tier_fit_score(*, player_tier: str, required_min: str, required_max: str) -> int:
    player_rank = SKILL_RANKS.get(player_tier, 1)
    min_rank = SKILL_RANKS.get(required_min, 1)
    max_rank = SKILL_RANKS.get(required_max, 3)
    if min_rank <= player_rank <= max_rank:
        return 60
    rank_gap = min(abs(player_rank - min_rank), abs(player_rank - max_rank))
    if rank_gap == 1:
        return 35
    return 15


def _distance_score(*, session_district: str, preferred_district: str | None) -> tuple[int, str]:
    if not preferred_district:
        return 20, "unknown"
    if session_district.strip().lower() == preferred_district.strip().lower():
        return 30, "same_district"
    return 10, "different_district"


def _slot_fit_score(*, open_slots: int, max_slots: int, allows_solo_join: bool) -> int:
    if open_slots <= 0:
        return 0
    ratio = open_slots / max(max_slots, 1)
    score = 20 if ratio >= 0.5 else 12
    if allows_solo_join:
        score += 5
    return min(score, 30)


def _recommendation_label(score: int) -> str:
    if score >= 88:
        return "high"
    if score >= 68:
        return "medium"
    return "low"


def list_discovery_sessions(
    *,
    player_user_id: str | None = None,
    sport: str | None = None,
    district: str | None = None,
    starts_from: datetime | None = None,
    starts_to: datetime | None = None,
    has_open_slots: bool | None = None,
    post_type: str | None = None,
) -> list[dict[str, Any]]:
    now = datetime.now(UTC)
    params: dict[str, Any] = {
        "status_scheduled": "scheduled",
        "status_locked": "locked",
        "status_cancelled": "cancelled",
        "starts_from": starts_from or now,
    }
    where_parts = [
        (
            "s.status IN ("
            "CAST(:status_scheduled AS public.session_status), "
            "CAST(:status_locked AS public.session_status), "
            "CAST(:status_cancelled AS public.session_status)"
            ")"
        ),
        "s.starts_at >= :starts_from",
        "c.status = 'active'",
    ]
    if sport:
        where_parts.append("c.sport = CAST(:sport AS public.sport_type)")
        params["sport"] = sport
    if district:
        where_parts.append("cc.district ILIKE :district")
        params["district"] = f"%{district}%"
    if starts_to:
        where_parts.append("s.starts_at <= :starts_to")
        params["starts_to"] = starts_to
    if has_open_slots is True:
        where_parts.append("s.open_slots > 0")
    if has_open_slots is False:
        where_parts.append("s.open_slots = 0")
    if post_type:
        where_parts.append("s.post_type = CAST(:post_type AS public.session_post_type)")
        params["post_type"] = post_type

    where_clause = f"WHERE {' AND '.join(where_parts)} ORDER BY s.starts_at ASC LIMIT 1000"
    query = _session_select_sql(where_clause)
    with get_engine().begin() as connection:
        _expire_all_overdue_deposit_bookings(connection)
        player_tier = (
            _load_player_tier(connection, player_user_id=player_user_id)
            if player_user_id
            else "Beginner"
        )
        preferred_district = (
            _load_player_preferred_district(connection, player_user_id=player_user_id)
            if player_user_id
            else None
        )
        rows = connection.execute(text(query), params).all()
    sessions = [_session_from_row(row) for row in rows]

    for item in sessions:
        tier_score = _tier_fit_score(
            player_tier=player_tier,
            required_min=str(item["required_skill_min"]),
            required_max=str(item["required_skill_max"]),
        )
        distance_score, distance_bucket = _distance_score(
            session_district=str(item["district"]),
            preferred_district=preferred_district,
        )
        slot_score = _slot_fit_score(
            open_slots=int(item["open_slots"]),
            max_slots=int(item["max_slots"]),
            allows_solo_join=bool(item["allows_solo_join"]),
        )
        total_score = tier_score + distance_score + slot_score
        item["player_skill_tier"] = player_tier
        item["recommendation_score"] = total_score
        item["recommendation_label"] = _recommendation_label(total_score)
        item["distance_bucket"] = distance_bucket
        item["slot_fit_score"] = slot_score

    sessions.sort(
        key=lambda item: (
            -int(item.get("recommendation_score") or 0),
            item["starts_at"],
        )
    )
    return sessions


def get_session_detail(*, session_id: str) -> dict[str, Any]:
    query = _session_select_sql(
        """
        WHERE s.id = :session_id
        LIMIT 1
        """
    )
    with get_engine().begin() as connection:
        row = connection.execute(text(query), {"session_id": session_id}).first()
    if row is None:
        raise AppError(
            status_code=404,
            code="session_not_found",
            message="Không tìm thấy phiên sân",
        )
    return _session_from_row(row)


def _load_admin_config(connection: Any) -> dict[str, Any]:
    row = connection.execute(
        text(
            """
            SELECT platform_fee_rate, floor_fee_vnd, deposit_percent, auto_release_minutes
            FROM public.admin_configs
            WHERE id = 1
            LIMIT 1
            """
        )
    ).first()
    if row is None:
        raise AppError(
            status_code=503,
            code="admin_config_missing",
            message="Cấu hình hệ thống chưa sẵn sàng",
        )
    return {
        "platform_fee_rate": Decimal(row.platform_fee_rate),
        "floor_fee_vnd": int(row.floor_fee_vnd),
        "deposit_percent": Decimal(row.deposit_percent),
        "auto_release_minutes": int(row.auto_release_minutes),
    }


def _booking_detail_query() -> str:
    return """
        SELECT
          b.id,
          b.booking_code,
          b.session_id,
          b.court_id,
          b.player_user_id,
          b.mode::text AS mode,
          b.seats_booked,
          b.status::text AS status,
          b.payment_method::text AS payment_method,
          b.base_price_vnd,
          b.floor_fee_vnd,
          b.platform_fee_vnd,
          b.total_price_vnd,
          b.deposit_required_vnd,
          b.remaining_due_vnd,
          b.qr_payload,
          b.checked_in_at,
          b.completed_at,
          b.cancelled_at,
          b.cancel_reason,
          b.created_at,
          b.updated_at,
          s.title AS session_title,
          s.starts_at AS session_starts_at,
          s.allows_solo_join AS session_allows_solo_join,
          cc.name AS complex_name,
          cc.district,
          c.name AS court_name,
          c.sub_court_name,
          c.sport::text AS sport
        FROM public.bookings b
        JOIN public.sessions s ON s.id = b.session_id
        JOIN public.courts c ON c.id = b.court_id
        JOIN public.court_complexes cc ON cc.id = c.complex_id
    """


def list_my_bookings(*, player_user_id: str) -> list[dict[str, Any]]:
    query = f"""
        {_booking_detail_query()}
        WHERE b.player_user_id = :player_user_id
        ORDER BY b.created_at DESC
        LIMIT 200
    """
    with get_engine().begin() as connection:
        _expire_overdue_deposit_bookings(connection, player_user_id=player_user_id)
        rows = connection.execute(text(query), {"player_user_id": player_user_id}).all()
    return [_booking_from_row(row) for row in rows]


def get_my_booking(*, player_user_id: str, booking_id: str) -> dict[str, Any]:
    query = f"""
        {_booking_detail_query()}
        WHERE b.id = :booking_id AND b.player_user_id = :player_user_id
        LIMIT 1
    """
    with get_engine().begin() as connection:
        _expire_overdue_deposit_bookings(
            connection, player_user_id=player_user_id, session_id=None
        )
        row = connection.execute(
            text(query), {"booking_id": booking_id, "player_user_id": player_user_id}
        ).first()
    if row is None:
        raise AppError(
            status_code=404,
            code="booking_not_found",
            message="Không tìm thấy booking của tài khoản này",
        )
    return _booking_from_row(row)


def create_booking(*, player_user_id: str, data: dict[str, Any]) -> dict[str, Any]:
    mode = str(data["mode"])
    payment_method = str(data["payment_method"])
    if mode not in {"solo", "full_court"}:
        raise AppError(
            status_code=422,
            code="booking_mode_invalid",
            message="Mode booking không hợp lệ",
        )
    if payment_method not in {"vnpay", "cash"}:
        raise AppError(
            status_code=422,
            code="booking_payment_method_invalid",
            message="Phương thức thanh toán không hợp lệ",
        )

    session_ids = data.get("session_ids") or []
    if not session_ids and "session_id" in data:
        session_ids = [str(data["session_id"])]
        
    if not session_ids:
        raise AppError(status_code=400, code="missing_session", message="Cần chọn ít nhất 1 khung giờ")

    with get_engine().begin() as connection:
        _expire_overdue_deposit_bookings(connection, player_user_id=player_user_id, session_id=None)

        placeholders = ", ".join(f":s{i}" for i in range(len(session_ids)))
        params = {f"s{i}": s_id for i, s_id in enumerate(session_ids)}
        
        sessions_rows = connection.execute(
            text(f"""
                SELECT
                  s.id,
                  s.court_id,
                  s.created_by_user_id,
                  s.title,
                  s.status::text AS status,
                  s.starts_at,
                  s.ends_at,
                  s.duration_minutes,
                  s.open_slots,
                  s.max_slots,
                  s.slot_price_vnd,
                  s.full_court_price_vnd,
                  s.allows_solo_join,
                  s.post_type::text AS post_type,
                  c.min_rental_duration_minutes
                FROM public.sessions s
                JOIN public.courts c ON c.id = s.court_id
                WHERE s.id IN ({placeholders})
                ORDER BY s.starts_at ASC
                FOR UPDATE
            """),
            params
        ).all()

        if len(sessions_rows) != len(session_ids):
             raise AppError(status_code=404, code="session_not_found", message="Một số khung giờ không tồn tại hoặc đã bị đặt")

        first_s = sessions_rows[0]
        court_id = first_s.court_id
        for i, s in enumerate(sessions_rows):
            if str(s.status) not in SESSION_DISCOVERY_STATUSES:
                 raise AppError(status_code=409, code="session_not_bookable", message="Một số khung giờ không còn nhận booking")
            if str(s.court_id) != str(court_id):
                 raise AppError(status_code=400, code="invalid_sessions", message="Các khung giờ phải thuộc cùng một sân")
            if s.starts_at <= datetime.now(UTC):
                 raise AppError(status_code=409, code="session_already_started", message="Phiên sân đã qua giờ nhận booking")
            if i > 0:
                prev_s = sessions_rows[i-1]
                if s.starts_at != prev_s.ends_at:
                    raise AppError(status_code=400, code="invalid_sessions", message="Các khung giờ phải liên tiếp nhau")

        total_full_price = sum(int(s.full_court_price_vnd) for s in sessions_rows)
        total_slot_price = sum(int(s.slot_price_vnd) for s in sessions_rows)
        total_duration = sum(int(s.duration_minutes) for s in sessions_rows)

        if total_duration < int(first_s.min_rental_duration_minutes):
            raise AppError(
                status_code=400,
                code="insufficient_booking_duration",
                message=f"Sân này yêu cầu đặt tối thiểu {first_s.min_rental_duration_minutes} phút."
            )

        if len(session_ids) > 1:
            connection.execute(
                text(f"DELETE FROM public.sessions WHERE id IN ({placeholders})"),
                params
            )
            starts_local = first_s.starts_at.astimezone()
            ends_local = sessions_rows[-1].ends_at.astimezone()
            merged_title = f"Ca {starts_local.strftime('%H:%M')} - {ends_local.strftime('%H:%M')}"
            
            session = connection.execute(
                text("""
                    INSERT INTO public.sessions (
                        court_id, created_by_user_id, title, post_type, status,
                        starts_at, duration_minutes, ends_at,
                        open_slots, max_slots, slot_price_vnd, full_court_price_vnd, allows_solo_join
                    ) VALUES (
                        :court_id, :created_by_user_id, :title, CAST(:post_type AS public.session_post_type), CAST(:status AS public.session_status),
                        :starts_at, :duration_minutes, :ends_at,
                        :open_slots, :max_slots, :slot_price_vnd, :full_court_price_vnd, :allows_solo_join
                    ) RETURNING id, court_id, title, status::text, starts_at, open_slots, max_slots, slot_price_vnd, full_court_price_vnd, allows_solo_join
                """),
                {
                    "court_id": court_id,
                    "created_by_user_id": first_s.created_by_user_id,
                    "title": merged_title,
                    "post_type": first_s.post_type,
                    "status": first_s.status,
                    "starts_at": first_s.starts_at,
                    "duration_minutes": total_duration,
                    "ends_at": sessions_rows[-1].ends_at,
                    "open_slots": first_s.open_slots,
                    "max_slots": first_s.max_slots,
                    "slot_price_vnd": total_slot_price,
                    "full_court_price_vnd": total_full_price,
                    "allows_solo_join": first_s.allows_solo_join
                }
            ).first()
        else:
            session = first_s
            
            # Check active booking only for single session (merged session is fresh so no active booking exists yet)
            active_booking = connection.execute(
                text("""
                    SELECT id
                    FROM public.bookings
                    WHERE session_id = :session_id
                      AND player_user_id = :player_user_id
                      AND status NOT IN ('cancelled', 'expired')
                    LIMIT 1
                """),
                {"session_id": session.id, "player_user_id": player_user_id},
            ).first()
            if active_booking is not None:
                raise AppError(
                    status_code=409,
                    code="booking_already_exists",
                    message="Bạn đã đặt lịch cho phiên này nhưng chưa thanh toán. Vui lòng vào Quản lý lịch đặt -> Sắp tới để tiếp tục thanh toán.",
                )

        if mode == "full_court":
            seats_booked = int(session.max_slots)
        else:
            if not bool(session.allows_solo_join):
                raise AppError(
                    status_code=409,
                    code="session_solo_not_allowed",
                    message="Phiên sân hiện không cho phép đặt slot solo",
                )
            seats_booked = int(data.get("seats_booked") or 1)
            if seats_booked < 1 or seats_booked > 2:
                raise AppError(
                    status_code=422,
                    code="booking_seats_invalid",
                    message="Booking solo chỉ hỗ trợ 1 hoặc 2 slot",
                )

        open_slots = int(session.open_slots)
        if open_slots < seats_booked:
            raise AppError(
                status_code=409,
                code="session_slots_unavailable",
                message="Số slot còn trống không đủ cho booking",
            )

        config = _load_admin_config(connection)
        if mode == "full_court":
            base_price_vnd = int(session.full_court_price_vnd)
        else:
            base_price_vnd = int(session.slot_price_vnd) * seats_booked
        platform_fee_vnd = _round_money(
            Decimal(base_price_vnd) * Decimal(config["platform_fee_rate"])
        )
        floor_fee_vnd = int(config["floor_fee_vnd"])
        total_price_vnd = base_price_vnd + platform_fee_vnd + floor_fee_vnd
        if payment_method == "cash":
            deposit_required_vnd = 0
            remaining_due_vnd = total_price_vnd
            booking_status = "confirmed"
        else:
            deposit_required_vnd = _round_money(
                Decimal(total_price_vnd) * Decimal(config["deposit_percent"]) / Decimal(100)
            )
            deposit_required_vnd = max(deposit_required_vnd, 1)
            remaining_due_vnd = total_price_vnd - deposit_required_vnd
            booking_status = "awaiting_deposit"

        booking_code = f"BK{token_hex(4).upper()}"
        qr_payload = f"NETUP:{booking_code}"
        booking = connection.execute(
            text(
                """
                INSERT INTO public.bookings (
                  booking_code,
                  session_id,
                  court_id,
                  player_user_id,
                  mode,
                  seats_booked,
                  status,
                  payment_method,
                  base_price_vnd,
                  floor_fee_vnd,
                  platform_fee_vnd,
                  total_price_vnd,
                  deposit_required_vnd,
                  remaining_due_vnd,
                  qr_payload
                )
                VALUES (
                  :booking_code,
                  :session_id,
                  :court_id,
                  :player_user_id,
                  CAST(:mode AS public.booking_mode),
                  :seats_booked,
                  CAST(:booking_status AS public.booking_status),
                  CAST(:payment_method AS public.payment_method),
                  :base_price_vnd,
                  :floor_fee_vnd,
                  :platform_fee_vnd,
                  :total_price_vnd,
                  :deposit_required_vnd,
                  :remaining_due_vnd,
                  :qr_payload
                )
                RETURNING id
                """
            ),
            {
                "booking_code": booking_code,
                "session_id": str(session.id),
                "court_id": str(session.court_id),
                "player_user_id": player_user_id,
                "mode": mode,
                "seats_booked": seats_booked,
                "booking_status": booking_status,
                "payment_method": payment_method,
                "base_price_vnd": base_price_vnd,
                "floor_fee_vnd": floor_fee_vnd,
                "platform_fee_vnd": platform_fee_vnd,
                "total_price_vnd": total_price_vnd,
                "deposit_required_vnd": deposit_required_vnd,
                "remaining_due_vnd": remaining_due_vnd,
                "qr_payload": qr_payload,
            },
        ).first()
        if booking is None:
            raise AppError(
                status_code=500,
                code="booking_create_failed",
                message="Không tạo được booking",
            )


        if payment_method == "vnpay":
            expires_at = datetime.now(UTC) + timedelta(seconds=150)
            connection.execute(
                text(
                    """
                INSERT INTO public.payment_transactions (
                  booking_id,
                  kind,
                  method,
                  provider,
                  external_ref,
                  amount_vnd,
                  status,
                  metadata,
                  expires_at
                )
                VALUES (
                  :booking_id,
                  CAST('deposit' AS public.payment_transaction_kind),
                  CAST('vnpay' AS public.payment_method),
                  'vnpay',
                  :external_ref,
                  :amount_vnd,
                  CAST('pending' AS public.payment_status),
                  :metadata,
                  :expires_at
                )
                    """
                ),
                {
                    "booking_id": str(booking.id),
                    "external_ref": f"DEP{booking_code}",
                    "amount_vnd": deposit_required_vnd,
                    "metadata": Jsonb({"source": "booking_create"}),
                    "expires_at": expires_at,
                },
            )

        if remaining_due_vnd > 0:
            remaining_provider = "vnpay" if payment_method == "vnpay" else None
            connection.execute(
                text(
                    """
                    INSERT INTO public.payment_transactions (
                      booking_id,
                      kind,
                      method,
                      provider,
                      external_ref,
                      amount_vnd,
                      status,
                      metadata
                    )
                    VALUES (
                      :booking_id,
                      CAST('remaining' AS public.payment_transaction_kind),
                      CAST(:method AS public.payment_method),
                      :provider,
                      :external_ref,
                      :amount_vnd,
                      CAST('pending' AS public.payment_status),
                      :metadata
                    )
                    """
                ),
                {
                    "booking_id": str(booking.id),
                    "method": payment_method,
                    "provider": remaining_provider,
                    "external_ref": f"REM{booking_code}",
                    "amount_vnd": remaining_due_vnd,
                    "metadata": Jsonb(
                        {
                            "source": "booking_create",
                            "collect_at_venue": payment_method == "cash",
                        }
                    ),
                },
            )

        _audit(
            connection,
            actor_user_id=player_user_id,
            event_type="booking_created",
            entity_type="booking",
            entity_id=str(booking.id),
            payload={
                "session_id": str(session.id),
                "mode": mode,
                "seats_booked": seats_booked,
                "payment_method": payment_method,
            },
        )

        detail_row = connection.execute(
            text(
                f"""
                {_booking_detail_query()}
                WHERE b.id = :booking_id
                LIMIT 1
                """
            ),
            {"booking_id": str(booking.id)},
        ).first()

    if detail_row is None:
        raise AppError(
            status_code=500,
            code="booking_created_but_not_readable",
            message="Booking đã tạo nhưng không đọc được dữ liệu trả về",
        )
    return _booking_from_row(detail_row)


def create_booking_safe(*, player_user_id: str, data: dict[str, Any]) -> dict[str, Any]:
    try:
        return create_booking(player_user_id=player_user_id, data=data)
    except IntegrityError as exc:
        raise AppError(
            status_code=409,
            code="booking_conflict",
            message="Booking không hợp lệ do dữ liệu xung đột hoặc đã được người khác giữ chỗ",
        ) from exc
def publish_booking_as_pool(*, player_user_id: str, booking_id: str, open_slots: int) -> dict[str, Any]:
    with get_engine().begin() as connection:
        booking = connection.execute(
            text(
                """
                SELECT id, session_id, mode, status, seats_booked
                FROM public.bookings
                WHERE id = :booking_id AND player_user_id = :player_user_id
                FOR UPDATE
                """
            ),
            {"booking_id": booking_id, "player_user_id": player_user_id},
        ).first()

        if booking is None:
            raise AppError(status_code=404, code="booking_not_found", message="Không tìm thấy booking")

        if booking.mode != "full_court":
            raise AppError(status_code=400, code="invalid_booking_mode", message="Chỉ có thể tìm người vãng lai cho booking thuê nguyên sân")

        if str(booking.status) not in ("confirmed", "checked_in", "deposit_paid"):
            raise AppError(status_code=400, code="invalid_booking_status", message="Chỉ có thể mở booking đã thanh toán hoặc xác nhận")

        session = connection.execute(
            text(
                """
                SELECT id, max_slots, status, full_court_price_vnd
                FROM public.sessions
                WHERE id = :session_id
                FOR UPDATE
                """
            ),
            {"session_id": str(booking.session_id)}
        ).first()

        if open_slots < 1 or open_slots >= int(session.max_slots):
            raise AppError(status_code=400, code="invalid_open_slots", message=f"Số slot mở phải từ 1 đến {int(session.max_slots) - 1}")

        slot_price_vnd = int(session.full_court_price_vnd / session.max_slots) if session.max_slots > 0 else 0

        connection.execute(
            text(
                """
                UPDATE public.sessions
                SET post_type = CAST('pool' AS public.session_post_type),
                    allows_solo_join = true,
                    open_slots = :open_slots,
                    slot_price_vnd = :slot_price_vnd
                WHERE id = :session_id
                """
            ),
            {"session_id": str(session.id), "open_slots": open_slots, "slot_price_vnd": slot_price_vnd}
        )

        connection.execute(
            text(
                """
                INSERT INTO public.pool_posts (
                  session_id,
                  host_user_id,
                  status,
                  total_slots,
                  host_slots,
                  description
                )
                VALUES (
                  :session_id,
                  :host_user_id,
                  CAST('open' AS public.pool_post_status),
                  :total_slots,
                  :host_slots,
                  :description
                )
                ON CONFLICT (session_id) DO UPDATE SET
                  host_user_id = EXCLUDED.host_user_id,
                  status = EXCLUDED.status,
                  total_slots = EXCLUDED.total_slots,
                  host_slots = EXCLUDED.host_slots
                """
            ),
            {
                "session_id": str(session.id),
                "host_user_id": player_user_id,
                "total_slots": int(session.max_slots),
                "host_slots": int(session.max_slots) - open_slots,
                "description": "Tìm đồng đội ghép sân",
            }
        )

        _audit(
            connection,
            actor_user_id=player_user_id,
            event_type="booking_published_as_pool",
            entity_type="booking",
            entity_id=str(booking.id),
            payload={
                "session_id": str(session.id),
                "open_slots": open_slots
            }
        )

    return {"status": "ok"}
def unpublish_booking_as_pool(*, player_user_id: str, booking_id: str) -> dict[str, Any]:
    with get_engine().begin() as connection:
        booking = connection.execute(
            text(
                """
                SELECT id, session_id, mode, status
                FROM public.bookings
                WHERE id = :booking_id AND player_user_id = :player_user_id
                FOR UPDATE
                """
            ),
            {"booking_id": booking_id, "player_user_id": player_user_id},
        ).first()

        if booking is None:
            raise AppError(status_code=404, code="booking_not_found", message="Không tìm thấy booking")

        if booking.mode != "full_court":
            raise AppError(status_code=400, code="invalid_booking_mode", message="Chỉ có thể tắt tìm người vãng lai cho booking thuê nguyên sân")

        session = connection.execute(
            text(
                """
                SELECT id, status, allows_solo_join
                FROM public.sessions
                WHERE id = :session_id
                FOR UPDATE
                """
            ),
            {"session_id": str(booking.session_id)}
        ).first()

        if not session.allows_solo_join:
            raise AppError(status_code=400, code="pool_not_published", message="Booking chưa bật tính năng tìm vãng lai")

        connection.execute(
            text(
                """
                UPDATE public.sessions
                SET post_type = CAST('rental' AS public.session_post_type),
                    allows_solo_join = false,
                    open_slots = 0,
                    slot_price_vnd = 0
                WHERE id = :session_id
                """
            ),
            {"session_id": str(session.id)}
        )

        connection.execute(
            text("DELETE FROM public.pool_posts WHERE session_id = :session_id"),
            {"session_id": str(session.id)}
        )

        _audit(
            connection,
            actor_user_id=player_user_id,
            event_type="booking_unpublished_as_pool",
            entity_type="booking",
            entity_id=str(booking.id),
            payload={
                "session_id": str(session.id)
            }
        )

    return {"status": "ok"}
