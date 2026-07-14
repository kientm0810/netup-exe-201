from __future__ import annotations

from typing import Annotated

from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.errors import AppError
from app.services.admin_auth import AdminPrincipal, principal_from_access_token
from app.services.user_auth import (
    UserPrincipal,
    principal_from_user_access_token,
    user_has_active_role,
)

bearer_scheme = HTTPBearer(auto_error=False)


def require_admin(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
) -> AdminPrincipal:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise AppError(status_code=401, code="admin_unauthorized", message="Thiếu token admin")

    admin = principal_from_access_token(credentials.credentials)
    if admin is None:
        raise AppError(
            status_code=401,
            code="admin_token_invalid",
            message="Token admin không hợp lệ hoặc đã hết hạn",
        )
    return admin


def _bearer_token(credentials: HTTPAuthorizationCredentials | None) -> str | None:
    if credentials is None or credentials.scheme.lower() != "bearer":
        return None
    return credentials.credentials


def require_user(
    request: Request,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
) -> UserPrincipal:
    token = _bearer_token(credentials) or request.cookies.get("netup_user_access_token")
    if token is None:
        raise AppError(status_code=401, code="user_unauthorized", message="Thiếu token người dùng")

    user = principal_from_user_access_token(token)
    if user is None:
        raise AppError(
            status_code=401,
            code="user_token_invalid",
            message="Token người dùng không hợp lệ hoặc đã hết hạn",
        )
    return user


def optional_user(
    request: Request,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
) -> UserPrincipal | None:
    """Return the current user when available without making a public route private."""
    token = _bearer_token(credentials) or request.cookies.get("netup_user_access_token")
    if token is None:
        return None
    return principal_from_user_access_token(token)


def require_role(required_role: str):
    def dependency(user: Annotated[UserPrincipal, Depends(require_user)]) -> UserPrincipal:
        if required_role not in user.roles and not user_has_active_role(user.id, required_role):
            raise AppError(
                status_code=403,
                code="role_forbidden",
                message="Tài khoản không có quyền truy cập chức năng này",
            )
        return user

    return dependency


require_player = require_role("player")
require_owner = require_role("owner")
