from __future__ import annotations

from typing import Any
from urllib.parse import quote_plus

from psycopg.types.json import Jsonb
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

from app.core.errors import AppError
from app.core.security import hash_password
from app.db.session import get_engine


def _initial_avatar_url(full_name: str) -> str:
    return (
        "https://ui-avatars.com/api/?name="
        f"{quote_plus(full_name)}"
        "&background=4285F4&color=fff&size=96&bold=true&rounded=true&format=png&length=2"
    )


def _owner_from_row(row: Any) -> dict[str, Any]:
    return {
        "id": str(row.id),
        "email": str(row.email),
        "full_name": str(row.full_name),
        "username": str(row.username),
        "business_name": str(row.business_name),
        "phone": str(row.phone) if row.phone else None,
        "district": str(row.district) if row.district else None,
        "address": str(row.address) if row.address else None,
        "is_active": bool(row.is_active),
        "created_at": row.created_at,
    }


def list_owner_accounts() -> list[dict[str, Any]]:
    with get_engine().begin() as connection:
        rows = connection.execute(
            text(
                """
                SELECT
                  u.id,
                  u.email,
                  u.full_name,
                  credential.username,
                  COALESCE(request.business_name, complex.name, u.full_name) AS business_name,
                  u.phone,
                  u.district,
                  complex.address,
                  u.is_active,
                  u.created_at
                FROM public.users u
                JOIN public.user_role_assignments role
                  ON role.user_id = u.id
                 AND role.role = 'owner'
                 AND role.revoked_at IS NULL
                LEFT JOIN public.user_password_credentials credential
                  ON credential.user_id = u.id
                LEFT JOIN LATERAL (
                  SELECT business_name
                  FROM public.owner_service_requests
                  WHERE user_id = u.id AND status = 'approved'
                  ORDER BY reviewed_at DESC NULLS LAST, submitted_at DESC
                  LIMIT 1
                ) request ON true
                LEFT JOIN LATERAL (
                  SELECT name, address
                  FROM public.court_complexes
                  WHERE owner_user_id = u.id
                  ORDER BY created_at
                  LIMIT 1
                ) complex ON true
                WHERE credential.user_id IS NOT NULL
                ORDER BY u.created_at DESC, u.full_name
                """
            )
        ).all()
    return [_owner_from_row(row) for row in rows]


def create_owner_account(
    *, actor_user_id: str, data: dict[str, Any]
) -> dict[str, Any]:
    password_hash = hash_password(str(data["password"]))
    full_name = str(data["full_name"]).strip()
    params = {
        "email": str(data["email"]).strip().lower(),
        "full_name": full_name,
        "avatar_url": _initial_avatar_url(full_name),
        "username": str(data["username"]).strip().lower(),
        "password_hash": password_hash,
        "phone": str(data.get("phone") or "").strip() or None,
        "business_name": str(data["business_name"]).strip(),
        "district": str(data.get("district") or "").strip() or None,
        "address": str(data.get("address") or "").strip() or None,
        "actor_user_id": actor_user_id,
    }

    try:
        with get_engine().begin() as connection:
            conflict = connection.execute(
                text(
                    """
                    SELECT
                      EXISTS(SELECT 1 FROM public.users WHERE email = :email) AS email_exists,
                      EXISTS(
                        SELECT 1 FROM public.user_password_credentials
                        WHERE username = :username
                      ) AS username_exists
                    """
                ),
                params,
            ).one()
            if conflict.email_exists:
                raise AppError(
                    status_code=409,
                    code="owner_email_exists",
                    message="Email này đã thuộc một tài khoản khác",
                )
            if conflict.username_exists:
                raise AppError(
                    status_code=409,
                    code="owner_username_exists",
                    message="Tên đăng nhập này đã được sử dụng",
                )

            user = connection.execute(
                text(
                    """
                    INSERT INTO public.users (
                      email, full_name, avatar_url, phone, city, district, is_active
                    )
                    VALUES (
                      :email, :full_name, :avatar_url, :phone, 'Hà Nội', :district, true
                    )
                    RETURNING id, email, full_name, phone, district, is_active, created_at
                    """
                ),
                params,
            ).one()
            params["user_id"] = str(user.id)

            connection.execute(
                text(
                    """
                    INSERT INTO public.user_password_credentials (
                      user_id, username, password_hash, must_change_password
                    )
                    VALUES (:user_id, :username, :password_hash, true)
                    """
                ),
                params,
            )
            connection.execute(
                text(
                    """
                    INSERT INTO public.user_role_assignments (
                      user_id, role, granted_by, reason
                    )
                    VALUES (:user_id, 'owner', :actor_user_id, 'created directly by admin')
                    """
                ),
                params,
            )
            connection.execute(
                text(
                    """
                    INSERT INTO public.owner_post_quotas (
                      owner_user_id, rental_post_limit, slot_post_limit, updated_by_user_id
                    )
                    VALUES (:user_id, 10, 10, :actor_user_id)
                    ON CONFLICT (owner_user_id) DO NOTHING
                    """
                ),
                params,
            )
            connection.execute(
                text(
                    """
                    INSERT INTO public.owner_service_requests (
                      user_id,
                      business_name,
                      contact_phone,
                      facility_overview,
                      status,
                      reviewed_at,
                      reviewed_by,
                      review_note
                    )
                    VALUES (
                      :user_id,
                      :business_name,
                      :phone,
                      'Tài khoản chủ sân do admin khởi tạo trực tiếp',
                      'approved',
                      now(),
                      :actor_user_id,
                      'Đã xác minh khi admin tạo tài khoản'
                    )
                    """
                ),
                params,
            )

            if params["address"] and params["district"]:
                connection.execute(
                    text(
                        """
                        INSERT INTO public.court_complexes (
                          owner_user_id, name, district, address
                        )
                        VALUES (:user_id, :business_name, :district, :address)
                        """
                    ),
                    params,
                )

            connection.execute(
                text(
                    """
                    INSERT INTO public.audit_logs (
                      actor_user_id, event_type, entity_type, entity_id, payload
                    )
                    VALUES (
                      :actor_user_id,
                      'owner_account_created',
                      'user',
                      :user_id,
                      :payload
                    )
                    """
                ),
                {
                    **params,
                    "payload": Jsonb(
                        {
                            "email": params["email"],
                            "username": params["username"],
                            "business_name": params["business_name"],
                        }
                    ),
                },
            )

            row = connection.execute(
                text(
                    """
                    SELECT
                      u.id,
                      u.email,
                      u.full_name,
                      credential.username,
                      request.business_name,
                      u.phone,
                      u.district,
                      complex.address,
                      u.is_active,
                      u.created_at
                    FROM public.users u
                    JOIN public.user_password_credentials credential
                      ON credential.user_id = u.id
                    JOIN public.owner_service_requests request
                      ON request.user_id = u.id AND request.status = 'approved'
                    LEFT JOIN public.court_complexes complex
                      ON complex.owner_user_id = u.id
                    WHERE u.id = :user_id
                    ORDER BY request.reviewed_at DESC, complex.created_at
                    LIMIT 1
                    """
                ),
                params,
            ).one()
    except IntegrityError as exc:
        raise AppError(
            status_code=409,
            code="owner_account_conflict",
            message="Email hoặc tên đăng nhập đã được sử dụng",
        ) from exc

    return _owner_from_row(row)
