from __future__ import annotations

from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict, Field

from app.core.dependencies import require_admin
from app.core.errors import AppError
from app.services.admin_auth import AdminPrincipal
from app.services.admin_owners import create_owner_account, list_owner_accounts

router = APIRouter(prefix="/admin/owners", tags=["admin-owners"])


class OwnerAccountCreate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    full_name: str = Field(min_length=2, max_length=160)
    email: str = Field(min_length=5, max_length=254)
    username: str = Field(min_length=3, max_length=80, pattern=r"^[a-zA-Z0-9._-]+$")
    password: str = Field(min_length=8, max_length=200)
    phone: str | None = Field(default=None, max_length=30)
    business_name: str = Field(min_length=2, max_length=200)
    district: str | None = Field(default=None, max_length=120)
    address: str | None = Field(default=None, max_length=400)


class OwnerAccountResponse(BaseModel):
    id: str
    email: str
    full_name: str
    username: str
    business_name: str
    phone: str | None
    district: str | None = None
    address: str | None = None
    is_active: bool
    created_at: datetime


@router.get("", response_model=list[OwnerAccountResponse])
def get_owner_accounts(
    _admin: Annotated[AdminPrincipal, Depends(require_admin)],
) -> list[dict[str, object]]:
    return list_owner_accounts()


@router.post("", response_model=OwnerAccountResponse, status_code=201)
def post_owner_account(
    payload: OwnerAccountCreate,
    admin: Annotated[AdminPrincipal, Depends(require_admin)],
) -> dict[str, object]:
    if not admin.is_super_admin:
        raise AppError(
            status_code=403,
            code="super_admin_required",
            message="Chỉ super admin có thể tạo tài khoản chủ sân",
        )
    return create_owner_account(
        actor_user_id=admin.user_id,
        data=payload.model_dump(),
    )
