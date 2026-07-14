from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Any

from psycopg.types.json import Jsonb
from sqlalchemy import text

from app.core.errors import AppError
from app.db.session import get_engine
from app.services.web_analytics import get_web_analytics_metrics

PLATFORM_FEE_MIN = Decimal("0")
PLATFORM_FEE_MAX = Decimal("0.30")
FLOOR_FEE_MIN = 0
FLOOR_FEE_MAX = 200000
DEPOSIT_PERCENT_MIN = Decimal("5")
DEPOSIT_PERCENT_MAX = Decimal("80")
MATCHING_RADIUS_MIN = Decimal("1")
MATCHING_RADIUS_MAX = Decimal("30")
NO_SHOW_LIMIT_MIN = 1
NO_SHOW_LIMIT_MAX = 10
AUTO_RELEASE_MIN = 5
AUTO_RELEASE_MAX = 120
VIDEO_ASSESSMENT_SIZE_MIN = 1
VIDEO_ASSESSMENT_SIZE_MAX = 100
VIDEO_ASSESSMENT_DURATION_MIN = 5
VIDEO_ASSESSMENT_DURATION_MAX = 300


def _audit(
    connection: Any,
    *,
    actor_user_id: str | None,
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
            "payload": Jsonb(_json_safe(payload or {})),
        },
    )


def _json_safe(value: Any) -> Any:
    if isinstance(value, dict):
        return {str(key): _json_safe(item) for key, item in value.items()}
    if isinstance(value, list | tuple):
        return [_json_safe(item) for item in value]
    if isinstance(value, datetime | date):
        return value.isoformat()
    if isinstance(value, Decimal):
        return float(value)
    return value


def _config_from_row(row: Any) -> dict[str, Any]:
    return {
        "platform_fee_rate": float(Decimal(row.platform_fee_rate)),
        "floor_fee_vnd": int(row.floor_fee_vnd),
        "deposit_percent": float(Decimal(row.deposit_percent)),
        "matching_radius_km": float(Decimal(row.matching_radius_km)),
        "no_show_strike_limit": int(row.no_show_strike_limit),
        "auto_release_minutes": int(row.auto_release_minutes),
        "video_assessment_max_size_mb": int(row.video_assessment_max_size_mb),
        "video_assessment_max_duration_seconds": int(
            row.video_assessment_max_duration_seconds
        ),
        "support_hotline_enabled": bool(row.support_hotline_enabled),
        "updated_at": row.updated_at,
    }


def get_admin_config() -> dict[str, Any]:
    with get_engine().begin() as connection:
        row = connection.execute(
            text(
                """
                SELECT
                  platform_fee_rate,
                  floor_fee_vnd,
                  deposit_percent,
                  matching_radius_km,
                  no_show_strike_limit,
                  auto_release_minutes,
                  video_assessment_max_size_mb,
                  video_assessment_max_duration_seconds,
                  support_hotline_enabled,
                  updated_at
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
            message="Không tìm thấy cấu hình hệ thống",
        )

    return _config_from_row(row)


def _to_decimal(payload: dict[str, Any], key: str) -> Decimal | None:
    if key not in payload or payload[key] is None:
        return None
    try:
        return Decimal(str(payload[key]))
    except Exception as exc:  # noqa: BLE001
        raise AppError(
            status_code=422,
            code="admin_config_invalid",
            message=f"{key} phải là số hợp lệ",
        ) from exc


def _to_int(payload: dict[str, Any], key: str) -> int | None:
    if key not in payload or payload[key] is None:
        return None
    value = payload[key]
    if isinstance(value, bool):
        raise AppError(
            status_code=422,
            code="admin_config_invalid",
            message=f"{key} phải là số nguyên",
        )
    if isinstance(value, int):
        return value
    if isinstance(value, float) and value.is_integer():
        return int(value)
    raise AppError(
        status_code=422,
        code="admin_config_invalid",
        message=f"{key} phải là số nguyên",
    )


def _validate_range_decimal(
    *, key: str, value: Decimal, minimum: Decimal, maximum: Decimal
) -> None:
    if value < minimum or value > maximum:
        raise AppError(
            status_code=422,
            code="admin_config_out_of_range",
            message=(
                f"{key} phải nằm trong khoảng {minimum} đến {maximum}"
            ),
        )


def _validate_range_int(*, key: str, value: int, minimum: int, maximum: int) -> None:
    if value < minimum or value > maximum:
        raise AppError(
            status_code=422,
            code="admin_config_out_of_range",
            message=f"{key} phải nằm trong khoảng {minimum} đến {maximum}",
        )


def update_admin_config(*, actor_user_id: str, data: dict[str, Any]) -> dict[str, Any]:
    change_reason = str(data.get("change_reason") or "").strip()
    if not change_reason:
        raise AppError(
            status_code=422,
            code="admin_config_reason_required",
            message="change_reason là bắt buộc để ghi audit",
        )

    platform_fee_rate = _to_decimal(data, "platform_fee_rate")
    floor_fee_vnd = _to_int(data, "floor_fee_vnd")
    deposit_percent = _to_decimal(data, "deposit_percent")
    matching_radius_km = _to_decimal(data, "matching_radius_km")
    no_show_strike_limit = _to_int(data, "no_show_strike_limit")
    auto_release_minutes = _to_int(data, "auto_release_minutes")
    video_assessment_max_size_mb = _to_int(data, "video_assessment_max_size_mb")
    video_assessment_max_duration_seconds = _to_int(
        data, "video_assessment_max_duration_seconds"
    )

    support_hotline_enabled: bool | None
    if "support_hotline_enabled" not in data or data["support_hotline_enabled"] is None:
        support_hotline_enabled = None
    elif isinstance(data["support_hotline_enabled"], bool):
        support_hotline_enabled = bool(data["support_hotline_enabled"])
    else:
        raise AppError(
            status_code=422,
            code="admin_config_invalid",
            message="support_hotline_enabled phải là boolean",
        )

    patch_fields: dict[str, Any] = {}
    if platform_fee_rate is not None:
        _validate_range_decimal(
            key="platform_fee_rate",
            value=platform_fee_rate,
            minimum=PLATFORM_FEE_MIN,
            maximum=PLATFORM_FEE_MAX,
        )
        patch_fields["platform_fee_rate"] = platform_fee_rate

    if floor_fee_vnd is not None:
        _validate_range_int(
            key="floor_fee_vnd",
            value=floor_fee_vnd,
            minimum=FLOOR_FEE_MIN,
            maximum=FLOOR_FEE_MAX,
        )
        patch_fields["floor_fee_vnd"] = floor_fee_vnd

    if deposit_percent is not None:
        _validate_range_decimal(
            key="deposit_percent",
            value=deposit_percent,
            minimum=DEPOSIT_PERCENT_MIN,
            maximum=DEPOSIT_PERCENT_MAX,
        )
        patch_fields["deposit_percent"] = deposit_percent

    if matching_radius_km is not None:
        _validate_range_decimal(
            key="matching_radius_km",
            value=matching_radius_km,
            minimum=MATCHING_RADIUS_MIN,
            maximum=MATCHING_RADIUS_MAX,
        )
        patch_fields["matching_radius_km"] = matching_radius_km

    if no_show_strike_limit is not None:
        _validate_range_int(
            key="no_show_strike_limit",
            value=no_show_strike_limit,
            minimum=NO_SHOW_LIMIT_MIN,
            maximum=NO_SHOW_LIMIT_MAX,
        )
        patch_fields["no_show_strike_limit"] = no_show_strike_limit

    if auto_release_minutes is not None:
        _validate_range_int(
            key="auto_release_minutes",
            value=auto_release_minutes,
            minimum=AUTO_RELEASE_MIN,
            maximum=AUTO_RELEASE_MAX,
        )
        patch_fields["auto_release_minutes"] = auto_release_minutes

    if video_assessment_max_size_mb is not None:
        _validate_range_int(
            key="video_assessment_max_size_mb",
            value=video_assessment_max_size_mb,
            minimum=VIDEO_ASSESSMENT_SIZE_MIN,
            maximum=VIDEO_ASSESSMENT_SIZE_MAX,
        )
        patch_fields["video_assessment_max_size_mb"] = video_assessment_max_size_mb

    if video_assessment_max_duration_seconds is not None:
        _validate_range_int(
            key="video_assessment_max_duration_seconds",
            value=video_assessment_max_duration_seconds,
            minimum=VIDEO_ASSESSMENT_DURATION_MIN,
            maximum=VIDEO_ASSESSMENT_DURATION_MAX,
        )
        patch_fields[
            "video_assessment_max_duration_seconds"
        ] = video_assessment_max_duration_seconds

    if support_hotline_enabled is not None:
        patch_fields["support_hotline_enabled"] = support_hotline_enabled

    if not patch_fields:
        raise AppError(
            status_code=422,
            code="admin_config_patch_empty",
            message="Không có trường cấu hình nào để cập nhật",
        )

    with get_engine().begin() as connection:
        current_row = connection.execute(
            text(
                """
                SELECT
                  platform_fee_rate,
                  floor_fee_vnd,
                  deposit_percent,
                  matching_radius_km,
                  no_show_strike_limit,
                  auto_release_minutes,
                  video_assessment_max_size_mb,
                  video_assessment_max_duration_seconds,
                  support_hotline_enabled,
                  updated_at
                FROM public.admin_configs
                WHERE id = 1
                FOR UPDATE
                """
            )
        ).first()

        if current_row is None:
            raise AppError(
                status_code=503,
                code="admin_config_missing",
                message="Không tìm thấy cấu hình hệ thống",
            )

        current_config = _config_from_row(current_row)

        set_clauses = ["updated_at = now()"]
        params: dict[str, Any] = {"id": 1}
        for key, value in patch_fields.items():
            set_clauses.append(f"{key} = :{key}")
            params[key] = value

        updated_row = connection.execute(
            text(
                f"""
                UPDATE public.admin_configs
                SET {', '.join(set_clauses)}
                WHERE id = :id
                RETURNING
                  platform_fee_rate,
                  floor_fee_vnd,
                  deposit_percent,
                  matching_radius_km,
                  no_show_strike_limit,
                  auto_release_minutes,
                  video_assessment_max_size_mb,
                  video_assessment_max_duration_seconds,
                  support_hotline_enabled,
                  updated_at
                """
            ),
            params,
        ).one()

        updated_config = _config_from_row(updated_row)
        _audit(
            connection,
            actor_user_id=actor_user_id,
            event_type="admin_config_updated",
            entity_type="admin_config",
            entity_id="1",
            payload={
                "reason": change_reason,
                "changed_fields": sorted(patch_fields.keys()),
                "before": current_config,
                "after": updated_config,
            },
        )

    return updated_config


def get_admin_dashboard_metrics(*, period_days: int = 30) -> dict[str, Any]:
    with get_engine().begin() as connection:
        row = connection.execute(
            text(
                """
                SELECT
                  (SELECT count(*)::int FROM public.bookings) AS bookings_total,
                  (
                    SELECT count(*)::int
                    FROM public.bookings
                    WHERE status = CAST('awaiting_deposit' AS public.booking_status)
                  ) AS bookings_awaiting_deposit,
                  (
                    SELECT count(*)::int
                    FROM public.bookings
                    WHERE status = CAST('checked_in' AS public.booking_status)
                  ) AS bookings_checked_in,
                  (
                    SELECT count(*)::int
                    FROM public.bookings
                    WHERE status = CAST('completed' AS public.booking_status)
                  ) AS bookings_completed,
                  (
                    SELECT count(*)::int
                    FROM public.bookings
                    WHERE created_at >= now() - interval '7 days'
                  ) AS bookings_last_7d,
                  (SELECT count(*)::int FROM public.payment_transactions) AS payments_total,
                  (
                    SELECT count(*)::int
                    FROM public.payment_transactions
                    WHERE status = CAST('paid' AS public.payment_status)
                  ) AS payments_paid,
                  (
                    SELECT COALESCE(sum(amount_vnd), 0)::bigint
                    FROM public.payment_transactions
                    WHERE status = CAST('paid' AS public.payment_status)
                  ) AS payments_paid_amount_vnd,
                  (
                    SELECT count(*)::int
                    FROM public.payment_transactions
                    WHERE status = CAST('processing' AS public.payment_status)
                  ) AS payments_processing,
                  (SELECT count(*)::int FROM public.checkins) AS checkins_total,
                  (
                    SELECT count(*)::int
                    FROM public.checkins
                    WHERE checked_in_at >= now() - interval '7 days'
                  ) AS checkins_last_7d,
                  (
                    SELECT count(*)::int
                    FROM public.owner_service_requests
                    WHERE status = CAST('pending' AS public.owner_request_status)
                  ) AS owner_requests_pending,
                  (
                    SELECT count(*)::int
                    FROM public.owner_service_requests
                    WHERE status = CAST('approved' AS public.owner_request_status)
                  ) AS owner_requests_approved,
                  (
                    SELECT count(*)::int
                    FROM public.owner_service_requests
                    WHERE status = CAST('rejected' AS public.owner_request_status)
                  ) AS owner_requests_rejected
                """
            )
        ).one()

    return {
        "analytics": get_web_analytics_metrics(period_days=period_days),
        "bookings": {
            "total": int(row.bookings_total),
            "awaiting_deposit": int(row.bookings_awaiting_deposit),
            "checked_in": int(row.bookings_checked_in),
            "completed": int(row.bookings_completed),
            "last_7d": int(row.bookings_last_7d),
        },
        "payments": {
            "total": int(row.payments_total),
            "paid": int(row.payments_paid),
            "processing": int(row.payments_processing),
            "paid_amount_vnd": int(row.payments_paid_amount_vnd),
        },
        "checkins": {
            "total": int(row.checkins_total),
            "last_7d": int(row.checkins_last_7d),
        },
        "owner_requests": {
            "pending": int(row.owner_requests_pending),
            "approved": int(row.owner_requests_approved),
            "rejected": int(row.owner_requests_rejected),
        },
    }


def list_admin_users(*, limit: int = 100, search: str | None = None) -> list[dict[str, Any]]:
    capped_limit = max(1, min(limit, 500))
    where_clause = ""
    params: dict[str, Any] = {"limit": capped_limit}
    if search:
        where_clause = """
        WHERE u.email::text ILIKE :search
           OR u.full_name ILIKE :search
           OR COALESCE(u.phone, '') ILIKE :search
        """
        params["search"] = f"%{search.strip()}%"

    with get_engine().begin() as connection:
        rows = connection.execute(
            text(
                f"""
                SELECT
                  u.id,
                  u.email,
                  u.full_name,
                  u.avatar_url,
                  u.phone,
                  u.city,
                  u.district,
                  u.is_active,
                  u.created_at,
                  u.updated_at,
                  COALESCE(
                    array_agg(DISTINCT ura.role::text)
                      FILTER (WHERE ura.role IS NOT NULL AND ura.revoked_at IS NULL),
                    ARRAY[]::text[]
                  ) AS roles,
                  er.visible_skill_tier::text AS visible_skill_tier,
                  er.elo_value,
                  EXISTS (
                    SELECT 1
                    FROM public.oauth_identities oi
                    WHERE oi.user_id = u.id AND oi.provider = 'google'
                  ) AS has_google_identity
                FROM public.users u
                LEFT JOIN public.user_role_assignments ura ON ura.user_id = u.id
                LEFT JOIN public.elo_ratings er ON er.player_user_id = u.id
                {where_clause}
                GROUP BY
                  u.id,
                  er.visible_skill_tier,
                  er.elo_value
                ORDER BY u.created_at DESC, u.full_name ASC
                LIMIT :limit
                """
            ),
            params,
        ).all()

    return [
        {
            "id": str(row.id),
            "email": str(row.email),
            "full_name": str(row.full_name),
            "avatar_url": str(row.avatar_url) if row.avatar_url else None,
            "phone": str(row.phone) if row.phone else None,
            "city": str(row.city) if row.city else None,
            "district": str(row.district) if row.district else None,
            "is_active": bool(row.is_active),
            "roles": list(row.roles or []),
            "visible_skill_tier": str(row.visible_skill_tier)
            if row.visible_skill_tier
            else "Beginner",
            "elo_value": int(row.elo_value) if row.elo_value is not None else 1000,
            "has_google_identity": bool(row.has_google_identity),
            "created_at": row.created_at,
            "updated_at": row.updated_at,
        }
        for row in rows
    ]


def list_admin_audit_logs(
    *,
    limit: int = 50,
    event_type: str | None = None,
    entity_type: str | None = None,
    actor_user_id: str | None = None,
) -> list[dict[str, Any]]:
    capped_limit = max(1, min(limit, 200))
    where_parts: list[str] = []
    params: dict[str, Any] = {"limit": capped_limit}

    if event_type:
        where_parts.append("a.event_type = :event_type")
        params["event_type"] = event_type
    if entity_type:
        where_parts.append("a.entity_type = :entity_type")
        params["entity_type"] = entity_type
    if actor_user_id:
        where_parts.append("a.actor_user_id = CAST(:actor_user_id AS uuid)")
        params["actor_user_id"] = actor_user_id

    where_clause = f"WHERE {' AND '.join(where_parts)}" if where_parts else ""

    with get_engine().begin() as connection:
        rows = connection.execute(
            text(
                f"""
                SELECT
                  a.id,
                  a.actor_user_id,
                  u.email AS actor_email,
                  u.full_name AS actor_full_name,
                  a.event_type,
                  a.entity_type,
                  a.entity_id,
                  a.payload,
                  a.created_at
                FROM public.audit_logs a
                LEFT JOIN public.users u ON u.id = a.actor_user_id
                {where_clause}
                ORDER BY a.created_at DESC
                LIMIT :limit
                """
            ),
            params,
        ).all()

    logs: list[dict[str, Any]] = []
    for row in rows:
        logs.append(
            {
                "id": str(row.id),
                "actor_user_id": str(row.actor_user_id) if row.actor_user_id else None,
                "actor_email": str(row.actor_email) if row.actor_email else None,
                "actor_full_name": str(row.actor_full_name) if row.actor_full_name else None,
                "event_type": str(row.event_type),
                "entity_type": str(row.entity_type),
                "entity_id": str(row.entity_id),
                "payload": dict(row.payload or {}),
                "created_at": row.created_at,
            }
        )
    return logs
