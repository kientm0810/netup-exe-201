from __future__ import annotations

from datetime import UTC, date, datetime

from fastapi.testclient import TestClient

from app.core.dependencies import require_admin, require_owner, require_user
from app.main import app
from app.services.admin_auth import AdminPrincipal
from app.services.user_auth import UserPrincipal


def setup_function() -> None:  # type: ignore[no-untyped-def]
    app.dependency_overrides.clear()


def teardown_function() -> None:  # type: ignore[no-untyped-def]
    app.dependency_overrides.clear()


def _owner() -> UserPrincipal:
    return UserPrincipal(
        id="owner-id",
        email="owner@example.com",
        full_name="CLB FPT",
        avatar_url=None,
        roles=["owner"],
    )


def _user() -> UserPrincipal:
    return UserPrincipal(
        id="user-id",
        email="user@example.com",
        full_name="Người chơi",
        avatar_url=None,
        roles=["player"],
    )


def _admin() -> AdminPrincipal:
    return AdminPrincipal(
        id="admin-id",
        user_id="admin-user-id",
        username="admin",
        is_super_admin=True,
    )


def _invoice() -> dict[str, object]:
    now = datetime(2026, 7, 14, 10, 0, tzinfo=UTC)
    return {
        "id": "invoice-id",
        "invoice_code": "FPT-20260714-01",
        "owner_name": "CLB FPT",
        "customer_full_name": "Người chơi",
        "customer_email": "user@example.com",
        "status": "paid",
        "payment_method": "cash",
        "subtotal_vnd": 160000,
        "discount_vnd": 0,
        "total_vnd": 160000,
        "issued_at": now,
        "paid_at": now,
        "source": "owner",
        "note": None,
        "items": [
            {
                "id": "item-id",
                "item_type": "court_rental",
                "description": "Thuê sân",
                "unit": "lượt",
                "quantity": 1,
                "unit_price_vnd": 160000,
                "line_total_vnd": 160000,
            }
        ],
    }


def test_owner_dashboard_contract(client: TestClient, monkeypatch) -> None:  # type: ignore[no-untyped-def]
    app.dependency_overrides[require_owner] = _owner
    monkeypatch.setattr(
        "app.api.owner_commerce.get_owner_commerce_dashboard",
        lambda **_: {
            "total_revenue_vnd": 17_914_000,
            "court_revenue_vnd": 15_274_000,
            "water_revenue_vnd": 1_410_000,
            "shuttlecock_revenue_vnd": 1_230_000,
            "paid_invoice_count": 287,
            "pending_invoice_count": 0,
            "daily": [
                {
                    "date": date(2026, 7, 13),
                    "total_revenue_vnd": 1_011_000,
                    "court_revenue_vnd": 881_000,
                    "water_revenue_vnd": 70_000,
                    "shuttlecock_revenue_vnd": 60_000,
                }
            ],
            "recent_invoices": [_invoice()],
        },
    )

    response = client.get("/api/v1/owner/commerce/dashboard")

    assert response.status_code == 200
    assert response.json()["total_revenue_vnd"] == 17_914_000
    assert response.json()["paid_invoice_count"] == 287


def test_user_can_list_own_bills(client: TestClient, monkeypatch) -> None:  # type: ignore[no-untyped-def]
    app.dependency_overrides[require_user] = _user
    monkeypatch.setattr(
        "app.api.owner_commerce.list_player_bills", lambda **_: [_invoice()]
    )

    response = client.get("/api/v1/bills")

    assert response.status_code == 200
    assert response.json()[0]["customer_email"] == "user@example.com"


def test_super_admin_can_create_owner(client: TestClient, monkeypatch) -> None:  # type: ignore[no-untyped-def]
    app.dependency_overrides[require_admin] = _admin
    now = datetime(2026, 7, 14, 10, 0, tzinfo=UTC)
    monkeypatch.setattr(
        "app.api.admin_owners.create_owner_account",
        lambda **_: {
            "id": "new-owner-id",
            "email": "owner@example.com",
            "full_name": "Chủ sân",
            "username": "owner.test",
            "business_name": "Sân Test",
            "phone": "0900000000",
            "district": "Thạch Thất",
            "address": "Hòa Lạc",
            "is_active": True,
            "created_at": now,
        },
    )

    response = client.post(
        "/api/v1/admin/owners",
        json={
            "email": "owner@example.com",
            "full_name": "Chủ sân",
            "username": "owner.test",
            "password": "StrongPassword@2026",
            "business_name": "Sân Test",
            "phone": "0900000000",
            "district": "Thạch Thất",
            "address": "Hòa Lạc",
        },
    )

    assert response.status_code == 201
    assert response.json()["username"] == "owner.test"
