from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any

import httpx
from psycopg.types.json import Jsonb
from sqlalchemy import text

from app.core.config import get_settings
from app.core.errors import AppError
from app.core.security import (
    create_refresh_token,
    create_signed_token,
    decode_signed_token,
    hash_token,
    verify_password,
)
from app.db.session import get_engine

GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo"


@dataclass(frozen=True)
class UserPrincipal:
    id: str
    email: str
    full_name: str
    avatar_url: str | None
    roles: list[str]


def _roles_for_user(connection: Any, user_id: str) -> list[str]:
    rows = connection.execute(
        text(
            """
            SELECT role::text AS role
            FROM public.user_role_assignments
            WHERE user_id = :user_id AND revoked_at IS NULL
            ORDER BY role::text
            """
        ),
        {"user_id": user_id},
    ).all()
    return [str(row.role) for row in rows]


def user_has_active_role(user_id: str, role: str) -> bool:
    with get_engine().begin() as connection:
        row = connection.execute(
            text(
                """
                SELECT 1
                FROM public.user_role_assignments
                WHERE user_id = :user_id
                  AND role = CAST(:role AS public.user_role)
                  AND revoked_at IS NULL
                LIMIT 1
                """
            ),
            {"user_id": user_id, "role": role},
        ).first()
        return row is not None


def create_user_access_token(user: UserPrincipal) -> str:
    settings = get_settings()
    return create_signed_token(
        subject=user.id,
        token_type="user_access",
        secret_key=settings.app_secret_key,
        expires_delta=timedelta(minutes=settings.user_access_token_minutes),
        extra={
            "email": user.email,
            "full_name": user.full_name,
            "avatar_url": user.avatar_url,
            "roles": user.roles,
        },
    )


def _token_response_for_user(
    user: UserPrincipal, *, ip: str | None, user_agent: str | None
) -> dict[str, Any]:
    settings = get_settings()
    refresh_token = create_refresh_token()
    expires_at = datetime.now(UTC) + timedelta(days=settings.user_refresh_token_days)

    with get_engine().begin() as connection:
        session_id = connection.execute(
            text(
                """
                INSERT INTO public.user_sessions
                  (user_id, refresh_token_hash, ip, user_agent, expires_at)
                VALUES (:user_id, :refresh_token_hash, :ip, :user_agent, :expires_at)
                RETURNING id
                """
            ),
            {
                "user_id": user.id,
                "refresh_token_hash": hash_token(refresh_token),
                "ip": ip,
                "user_agent": user_agent,
                "expires_at": expires_at,
            },
        ).scalar_one()

    return {
        "access_token": create_user_access_token(user),
        "refresh_token": refresh_token,
        "token_type": "bearer",
        "expires_in": settings.user_access_token_minutes * 60,
        "session_id": str(session_id),
        "user": user,
    }


def _exchange_google_code(code: str) -> dict[str, Any]:
    settings = get_settings()
    if not settings.google_client_id or not settings.google_client_secret:
        raise AppError(
            status_code=501,
            code="google_oauth_not_configured",
            message="Google OAuth chưa được cấu hình",
        )

    with httpx.Client(timeout=10) as client:
        token_response = client.post(
            GOOGLE_TOKEN_URL,
            data={
                "code": code,
                "client_id": settings.google_client_id,
                "client_secret": settings.google_client_secret,
                "redirect_uri": settings.google_redirect_uri,
                "grant_type": "authorization_code",
            },
        )
        if token_response.status_code >= 400:
            raise AppError(
                status_code=401,
                code="google_oauth_exchange_failed",
                message="Không đổi được mã đăng nhập Google",
            )

        access_token = token_response.json().get("access_token")
        if not access_token:
            raise AppError(
                status_code=401,
                code="google_oauth_token_missing",
                message="Google không trả access token",
            )

        userinfo_response = client.get(
            GOOGLE_USERINFO_URL,
            headers={"Authorization": f"Bearer {access_token}"},
        )
        if userinfo_response.status_code >= 400:
            raise AppError(
                status_code=401,
                code="google_oauth_userinfo_failed",
                message="Không lấy được hồ sơ Google",
            )
        return userinfo_response.json()


def _upsert_google_user(profile: dict[str, Any]) -> UserPrincipal:
    provider_user_id = str(profile.get("sub") or "")
    email = str(profile.get("email") or "")
    full_name = str(profile.get("name") or email)
    avatar_url = profile.get("picture")

    if not provider_user_id or not email:
        raise AppError(
            status_code=401,
            code="google_oauth_profile_invalid",
            message="Hồ sơ Google thiếu email hoặc định danh",
        )

    with get_engine().begin() as connection:
        user_row = connection.execute(
            text(
                """
                INSERT INTO public.users (email, full_name, avatar_url)
                VALUES (:email, :full_name, :avatar_url)
                ON CONFLICT (email) DO UPDATE
                SET full_name = EXCLUDED.full_name,
                    avatar_url = EXCLUDED.avatar_url,
                    updated_at = now()
                RETURNING id, email, full_name, avatar_url
                """
            ),
            {"email": email, "full_name": full_name, "avatar_url": avatar_url},
        ).one()

        connection.execute(
            text(
                """
                INSERT INTO public.oauth_identities (
                  user_id,
                  provider,
                  provider_user_id,
                  provider_email,
                  provider_payload,
                  last_login_at
                )
                VALUES
                  (:user_id, 'google', :provider_user_id, :provider_email, :provider_payload, now())
                ON CONFLICT (provider, provider_user_id) DO UPDATE
                SET user_id = EXCLUDED.user_id,
                    provider_email = EXCLUDED.provider_email,
                    provider_payload = EXCLUDED.provider_payload,
                    last_login_at = now()
                """
            ),
            {
                "user_id": user_row.id,
                "provider_user_id": provider_user_id,
                "provider_email": email,
                "provider_payload": Jsonb(profile),
            },
        )
        connection.execute(
            text(
                """
                INSERT INTO public.user_role_assignments (user_id, role, reason)
                VALUES (:user_id, 'player', 'google login default')
                ON CONFLICT DO NOTHING
                """
            ),
            {"user_id": user_row.id},
        )
        roles = _roles_for_user(connection, str(user_row.id))

    return UserPrincipal(
        id=str(user_row.id),
        email=str(user_row.email),
        full_name=str(user_row.full_name),
        avatar_url=str(user_row.avatar_url) if user_row.avatar_url else None,
        roles=roles,
    )


def authenticate_google_code(
    *, code: str, ip: str | None, user_agent: str | None
) -> dict[str, Any]:
    profile = _exchange_google_code(code)
    user = _upsert_google_user(profile)
    return _token_response_for_user(user, ip=ip, user_agent=user_agent)


def authenticate_local_user(
    *, username: str, password: str, ip: str | None, user_agent: str | None
) -> dict[str, Any] | None:
    """Authenticate a regular user/owner without crossing into admin auth."""
    clean_username = username.strip()
    with get_engine().begin() as connection:
        failed_attempts = connection.execute(
            text(
                """
                SELECT count(*)::int
                FROM public.user_login_audits
                WHERE success = false
                  AND username_attempt = :username
                  AND created_at >= now() - interval '15 minutes'
                """
            ),
            {"username": clean_username},
        ).scalar_one()
        if int(failed_attempts) >= 10:
            raise AppError(
                status_code=429,
                code="user_login_rate_limited",
                message="Đăng nhập sai quá nhiều lần. Vui lòng thử lại sau 15 phút.",
            )

        row = connection.execute(
            text(
                """
                SELECT
                  u.id,
                  u.email,
                  u.full_name,
                  u.avatar_url,
                  credential.password_hash
                FROM public.user_password_credentials credential
                JOIN public.users u ON u.id = credential.user_id
                WHERE credential.username = :username
                  AND u.is_active = true
                LIMIT 1
                """
            ),
            {"username": clean_username},
        ).first()
        success = row is not None and verify_password(password, row.password_hash)
        connection.execute(
            text(
                """
                INSERT INTO public.user_login_audits (
                  user_id, username_attempt, success, ip, user_agent
                )
                VALUES (:user_id, :username, :success, :ip, :user_agent)
                """
            ),
            {
                "user_id": row.id if row else None,
                "username": clean_username,
                "success": success,
                "ip": ip,
                "user_agent": user_agent,
            },
        )
        if not success:
            return None

        connection.execute(
            text(
                """
                UPDATE public.user_password_credentials
                SET last_login_at = now()
                WHERE user_id = :user_id
                """
            ),
            {"user_id": row.id},
        )
        roles = _roles_for_user(connection, str(row.id))

    user = UserPrincipal(
        id=str(row.id),
        email=str(row.email),
        full_name=str(row.full_name),
        avatar_url=str(row.avatar_url) if row.avatar_url else None,
        roles=roles,
    )
    return _token_response_for_user(user, ip=ip, user_agent=user_agent)


def refresh_user_session(refresh_token: str) -> dict[str, Any] | None:
    settings = get_settings()
    next_refresh_token = create_refresh_token()

    with get_engine().begin() as connection:
        row = connection.execute(
            text(
                """
                SELECT u.id, u.email, u.full_name, u.avatar_url, s.id AS session_id
                FROM public.user_sessions s
                JOIN public.users u ON u.id = s.user_id
                WHERE s.refresh_token_hash = :refresh_token_hash
                  AND s.revoked_at IS NULL
                  AND s.expires_at > now()
                  AND u.is_active = true
                """
            ),
            {"refresh_token_hash": hash_token(refresh_token)},
        ).first()
        if row is None:
            return None

        connection.execute(
            text(
                """
                UPDATE public.user_sessions
                SET refresh_token_hash = :next_hash,
                    expires_at = :expires_at
                WHERE id = :session_id
                """
            ),
            {
                "next_hash": hash_token(next_refresh_token),
                "expires_at": datetime.now(UTC) + timedelta(days=settings.user_refresh_token_days),
                "session_id": row.session_id,
            },
        )
        roles = _roles_for_user(connection, str(row.id))

    user = UserPrincipal(
        id=str(row.id),
        email=str(row.email),
        full_name=str(row.full_name),
        avatar_url=str(row.avatar_url) if row.avatar_url else None,
        roles=roles,
    )
    return {
        "access_token": create_user_access_token(user),
        "refresh_token": next_refresh_token,
        "token_type": "bearer",
        "expires_in": settings.user_access_token_minutes * 60,
        "user": user,
    }


def revoke_user_session(refresh_token: str) -> bool:
    with get_engine().begin() as connection:
        result = connection.execute(
            text(
                """
                UPDATE public.user_sessions
                SET revoked_at = now()
                WHERE refresh_token_hash = :refresh_token_hash
                  AND revoked_at IS NULL
                """
            ),
            {"refresh_token_hash": hash_token(refresh_token)},
        )
        return result.rowcount > 0


def principal_from_user_access_token(access_token: str) -> UserPrincipal | None:
    settings = get_settings()
    payload = decode_signed_token(
        access_token, secret_key=settings.app_secret_key, expected_type="user_access"
    )
    if payload is None:
        return None
    return UserPrincipal(
        id=str(payload["sub"]),
        email=str(payload["email"]),
        full_name=str(payload["full_name"]),
        avatar_url=payload.get("avatar_url"),
        roles=[str(role) for role in payload.get("roles", [])],
    )
