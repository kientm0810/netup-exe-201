from __future__ import annotations

from datetime import date, datetime
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, ConfigDict, Field

from app.core.dependencies import require_admin
from app.services.admin_auth import AdminPrincipal
from app.services.admin_operations import (
    get_admin_config,
    get_admin_dashboard_metrics,
    list_admin_audit_logs,
    list_admin_users,
    update_admin_config,
)

router = APIRouter(prefix="/admin", tags=["admin-operations"])


class AdminModel(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)


class AdminConfigResponse(BaseModel):
    platform_fee_rate: float
    floor_fee_vnd: int
    deposit_percent: float
    matching_radius_km: float
    no_show_strike_limit: int
    auto_release_minutes: int
    video_assessment_max_size_mb: int
    video_assessment_max_duration_seconds: int
    support_hotline_enabled: bool
    updated_at: datetime


class AdminConfigUpdateRequest(AdminModel):
    change_reason: str = Field(min_length=3, max_length=500)
    platform_fee_rate: float | None = None
    floor_fee_vnd: int | None = None
    deposit_percent: float | None = None
    matching_radius_km: float | None = None
    no_show_strike_limit: int | None = None
    auto_release_minutes: int | None = None
    video_assessment_max_size_mb: int | None = None
    video_assessment_max_duration_seconds: int | None = None
    support_hotline_enabled: bool | None = None


class BookingMetricsResponse(BaseModel):
    total: int
    awaiting_deposit: int
    checked_in: int
    completed: int
    last_7d: int


class PaymentMetricsResponse(BaseModel):
    total: int
    paid: int
    processing: int
    paid_amount_vnd: int


class CheckinMetricsResponse(BaseModel):
    total: int
    last_7d: int


class OwnerRequestMetricsResponse(BaseModel):
    pending: int
    approved: int
    rejected: int


class CommerceMetricsResponse(BaseModel):
    total_revenue_vnd: int
    paid_invoice_count: int
    court_revenue_vnd: int
    water_revenue_vnd: int
    shuttlecock_revenue_vnd: int


class WebAnalyticsDailyResponse(BaseModel):
    date: date
    total_visits: int
    new_users: int
    registered_accounts: int
    active_users: int
    returning_users: int


class WebAnalyticsMetricsResponse(BaseModel):
    total_website_visits: int
    new_users: int
    registered_accounts: int
    active_users: int
    returning_users: int
    seeded_visits: int
    is_estimated: bool
    period_days: int
    generated_at: datetime
    daily: list[WebAnalyticsDailyResponse]


class AdminDashboardMetricsResponse(BaseModel):
    analytics: WebAnalyticsMetricsResponse
    bookings: BookingMetricsResponse
    payments: PaymentMetricsResponse
    checkins: CheckinMetricsResponse
    owner_requests: OwnerRequestMetricsResponse
    commerce: CommerceMetricsResponse


class AdminAuditLogResponse(BaseModel):
    id: str
    actor_user_id: str | None
    actor_email: str | None
    actor_full_name: str | None
    event_type: str
    entity_type: str
    entity_id: str
    payload: dict[str, Any]
    created_at: datetime


class AdminUserResponse(BaseModel):
    id: str
    email: str
    full_name: str
    avatar_url: str | None
    phone: str | None
    city: str | None
    district: str | None
    is_active: bool
    roles: list[str]
    visible_skill_tier: str
    elo_value: int
    has_google_identity: bool
    created_at: datetime
    updated_at: datetime


@router.get("/config", response_model=AdminConfigResponse)
def get_config(
    _admin: Annotated[AdminPrincipal, Depends(require_admin)],
) -> dict[str, Any]:
    return get_admin_config()


@router.put("/config", response_model=AdminConfigResponse)
def put_config(
    payload: AdminConfigUpdateRequest,
    admin: Annotated[AdminPrincipal, Depends(require_admin)],
) -> dict[str, Any]:
    return update_admin_config(actor_user_id=admin.user_id, data=payload.model_dump())


@router.get("/dashboard/metrics", response_model=AdminDashboardMetricsResponse)
def get_dashboard_metrics(
    _admin: Annotated[AdminPrincipal, Depends(require_admin)],
    period_days: Annotated[int, Query(ge=7, le=30)] = 30,
) -> dict[str, Any]:
    return get_admin_dashboard_metrics(period_days=period_days)


@router.get("/users", response_model=list[AdminUserResponse])
def get_users(
    _admin: Annotated[AdminPrincipal, Depends(require_admin)],
    limit: Annotated[int, Query(ge=1, le=500)] = 100,
    search: Annotated[str | None, Query(min_length=1, max_length=120)] = None,
) -> list[dict[str, Any]]:
    return list_admin_users(limit=limit, search=search)


@router.get("/audit-logs", response_model=list[AdminAuditLogResponse])
def get_audit_logs(
    _admin: Annotated[AdminPrincipal, Depends(require_admin)],
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    event_type: Annotated[str | None, Query(min_length=1, max_length=120)] = None,
    entity_type: Annotated[str | None, Query(min_length=1, max_length=120)] = None,
    actor_user_id: Annotated[str | None, Query(min_length=1, max_length=64)] = None,
) -> list[dict[str, Any]]:
    return list_admin_audit_logs(
        limit=limit,
        event_type=event_type,
        entity_type=entity_type,
        actor_user_id=actor_user_id,
    )
