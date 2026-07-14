from __future__ import annotations

from datetime import date, datetime
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, ConfigDict, Field

from app.core.dependencies import require_owner, require_user
from app.services.owner_commerce import (
    create_owner_invoice,
    create_owner_product,
    get_owner_commerce_dashboard,
    get_owner_invoice,
    get_player_bill,
    list_owner_invoices,
    list_owner_products,
    list_player_bills,
    restock_owner_product,
)
from app.services.user_auth import UserPrincipal

owner_router = APIRouter(prefix="/owner", tags=["owner-commerce"])
player_router = APIRouter(tags=["player-bills"])


class CommerceModel(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)


class OwnerProductResponse(BaseModel):
    id: str
    sku: str
    name: str
    category: Literal["water", "shuttlecock"]
    unit: str
    sale_price_vnd: int
    stock_quantity: float
    is_active: bool
    created_at: datetime
    updated_at: datetime


class OwnerProductCreate(CommerceModel):
    sku: str = Field(min_length=1, max_length=80)
    name: str = Field(min_length=1, max_length=200)
    category: Literal["water", "shuttlecock"]
    unit: str = Field(min_length=1, max_length=40)
    sale_price_vnd: int = Field(ge=0, le=50_000_000)
    stock_quantity: int = Field(ge=0, le=1_000_000)


class OwnerProductRestock(CommerceModel):
    quantity: int = Field(ge=1, le=1_000_000)
    note: str | None = Field(default=None, max_length=500)


class OwnerInvoiceItemResponse(BaseModel):
    id: str
    item_type: Literal["court_rental", "water", "shuttlecock"]
    description: str
    unit: str
    quantity: float
    unit_price_vnd: int
    line_total_vnd: int


class OwnerInvoiceResponse(BaseModel):
    id: str
    invoice_code: str
    owner_name: str | None = None
    customer_full_name: str | None = None
    customer_email: str | None = None
    status: Literal["draft", "paid", "void"]
    payment_method: Literal["cash", "bank_transfer"]
    subtotal_vnd: int
    discount_vnd: int
    total_vnd: int
    source: Literal["owner"]
    note: str | None = None
    issued_at: datetime
    paid_at: datetime | None = None
    items: list[OwnerInvoiceItemResponse]


class OwnerInvoiceProductInput(CommerceModel):
    product_id: str = Field(min_length=1, max_length=64)
    quantity: int = Field(ge=1, le=10_000)


class OwnerInvoiceCreate(CommerceModel):
    customer_email: str | None = Field(default=None, max_length=254)
    rental_amount_vnd: int = Field(default=0, ge=0, le=50_000_000)
    payment_method: Literal["cash", "bank_transfer"] = "cash"
    note: str | None = Field(default=None, max_length=1_000)
    items: list[OwnerInvoiceProductInput] = Field(default_factory=list, max_length=50)


class OwnerCommerceDailyResponse(BaseModel):
    date: date
    total_revenue_vnd: int
    court_revenue_vnd: int
    water_revenue_vnd: int
    shuttlecock_revenue_vnd: int


class OwnerCommerceDashboardResponse(BaseModel):
    total_revenue_vnd: int
    court_revenue_vnd: int
    water_revenue_vnd: int
    shuttlecock_revenue_vnd: int
    paid_invoice_count: int
    pending_invoice_count: int
    daily: list[OwnerCommerceDailyResponse]
    recent_invoices: list[OwnerInvoiceResponse]


@owner_router.get("/products", response_model=list[OwnerProductResponse])
def get_products(
    owner: Annotated[UserPrincipal, Depends(require_owner)],
) -> list[dict[str, object]]:
    return list_owner_products(owner_user_id=owner.id)


@owner_router.post("/products", response_model=OwnerProductResponse, status_code=201)
def post_product(
    payload: OwnerProductCreate,
    owner: Annotated[UserPrincipal, Depends(require_owner)],
) -> dict[str, object]:
    return create_owner_product(owner_user_id=owner.id, data=payload.model_dump())


@owner_router.post("/products/{product_id}/restock", response_model=OwnerProductResponse)
def post_product_restock(
    product_id: str,
    payload: OwnerProductRestock,
    owner: Annotated[UserPrincipal, Depends(require_owner)],
) -> dict[str, object]:
    return restock_owner_product(
        owner_user_id=owner.id,
        product_id=product_id,
        quantity=payload.quantity,
        note=payload.note,
    )


@owner_router.get("/invoices", response_model=list[OwnerInvoiceResponse])
def get_invoices(
    owner: Annotated[UserPrincipal, Depends(require_owner)],
    limit: Annotated[int, Query(ge=1, le=500)] = 200,
) -> list[dict[str, object]]:
    return list_owner_invoices(owner_user_id=owner.id, limit=limit)


@owner_router.post("/invoices", response_model=OwnerInvoiceResponse, status_code=201)
def post_invoice(
    payload: OwnerInvoiceCreate,
    owner: Annotated[UserPrincipal, Depends(require_owner)],
) -> dict[str, object]:
    return create_owner_invoice(owner_user_id=owner.id, data=payload.model_dump())


@owner_router.get("/invoices/{invoice_id}", response_model=OwnerInvoiceResponse)
def get_invoice(
    invoice_id: str,
    owner: Annotated[UserPrincipal, Depends(require_owner)],
) -> dict[str, object]:
    return get_owner_invoice(owner_user_id=owner.id, invoice_id=invoice_id)


@owner_router.get("/commerce/dashboard", response_model=OwnerCommerceDashboardResponse)
def get_commerce_dashboard(
    owner: Annotated[UserPrincipal, Depends(require_owner)],
    period_days: Annotated[int, Query(ge=7, le=90)] = 30,
) -> dict[str, object]:
    return get_owner_commerce_dashboard(owner_user_id=owner.id, period_days=period_days)


@player_router.get("/bills", response_model=list[OwnerInvoiceResponse])
def get_player_bills(
    player: Annotated[UserPrincipal, Depends(require_user)],
    limit: Annotated[int, Query(ge=1, le=500)] = 200,
) -> list[dict[str, object]]:
    return list_player_bills(player_user_id=player.id, limit=limit)


@player_router.get("/bills/{invoice_id}", response_model=OwnerInvoiceResponse)
def get_player_bill_detail(
    invoice_id: str,
    player: Annotated[UserPrincipal, Depends(require_user)],
) -> dict[str, object]:
    return get_player_bill(player_user_id=player.id, invoice_id=invoice_id)


# Keep the owner router and response name stable for the narrowly-scoped
# player-bills router.  The latter deliberately owns /bills so owner routes
# remain grouped under /owner in the OpenAPI document.
router = owner_router
InvoiceResponse = OwnerInvoiceResponse
