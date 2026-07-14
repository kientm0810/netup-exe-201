from __future__ import annotations

from datetime import UTC, datetime

from fastapi.testclient import TestClient

from app.core.dependencies import require_admin
from app.main import app
from app.services.admin_auth import AdminPrincipal


def _clear_overrides() -> None:
    app.dependency_overrides.clear()


def setup_function() -> None:  # type: ignore[no-untyped-def]
    _clear_overrides()


def teardown_function() -> None:  # type: ignore[no-untyped-def]
    _clear_overrides()


def _admin() -> AdminPrincipal:
    return AdminPrincipal(
        id="admin-account-id",
        user_id="admin-user-id",
        username="admin",
        is_super_admin=True,
    )


def test_get_admin_config_endpoint(  # type: ignore[no-untyped-def]
    client: TestClient, monkeypatch
) -> None:
    app.dependency_overrides[require_admin] = _admin
    now = datetime(2026, 5, 28, 8, 0, tzinfo=UTC)

    monkeypatch.setattr(
        "app.api.admin_operations.get_admin_config",
        lambda **_: {
            "platform_fee_rate": 0.1,
            "floor_fee_vnd": 3000,
            "deposit_percent": 30.0,
            "matching_radius_km": 5.0,
            "no_show_strike_limit": 3,
            "auto_release_minutes": 15,
            "video_assessment_max_size_mb": 5,
            "video_assessment_max_duration_seconds": 60,
            "support_hotline_enabled": True,
            "updated_at": now,
        },
    )

    response = client.get("/api/v1/admin/config")

    assert response.status_code == 200
    assert response.json()["deposit_percent"] == 30.0


def test_put_admin_config_endpoint(  # type: ignore[no-untyped-def]
    client: TestClient, monkeypatch
) -> None:
    app.dependency_overrides[require_admin] = _admin
    now = datetime(2026, 5, 28, 8, 30, tzinfo=UTC)

    monkeypatch.setattr(
        "app.api.admin_operations.update_admin_config",
        lambda **_: {
            "platform_fee_rate": 0.12,
            "floor_fee_vnd": 3500,
            "deposit_percent": 35.0,
            "matching_radius_km": 8.0,
            "no_show_strike_limit": 3,
            "auto_release_minutes": 20,
            "video_assessment_max_size_mb": 10,
            "video_assessment_max_duration_seconds": 90,
            "support_hotline_enabled": True,
            "updated_at": now,
        },
    )

    response = client.put(
        "/api/v1/admin/config",
        json={
            "change_reason": "Seasonal adjustment",
            "platform_fee_rate": 0.12,
            "deposit_percent": 35,
            "matching_radius_km": 8,
            "auto_release_minutes": 20,
            "video_assessment_max_size_mb": 10,
            "video_assessment_max_duration_seconds": 90,
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["platform_fee_rate"] == 0.12
    assert payload["auto_release_minutes"] == 20
    assert payload["video_assessment_max_size_mb"] == 10


def test_get_admin_dashboard_metrics_endpoint(  # type: ignore[no-untyped-def]
    client: TestClient, monkeypatch
) -> None:
    app.dependency_overrides[require_admin] = _admin

    monkeypatch.setattr(
        "app.api.admin_operations.get_admin_dashboard_metrics",
        lambda **_: {
            "analytics": {
                "total_website_visits": 486,
                "new_users": 72,
                "registered_accounts": 303,
                "active_users": 154,
                "returning_users": 98,
                "seeded_visits": 470,
                "is_estimated": False,
                "period_days": 30,
                "generated_at": datetime(2026, 7, 14, 8, 0, tzinfo=UTC),
                "daily": [
                    {
                        "date": "2026-07-14",
                        "total_visits": 16,
                        "new_users": 4,
                        "registered_accounts": 3,
                        "active_users": 9,
                        "returning_users": 5,
                    }
                ],
            },
            "bookings": {
                "total": 100,
                "awaiting_deposit": 12,
                "checked_in": 24,
                "completed": 40,
                "last_7d": 31,
            },
            "payments": {
                "total": 140,
                "paid": 88,
                "processing": 6,
                "paid_amount_vnd": 12500000,
            },
            "checkins": {"total": 57, "last_7d": 19},
            "owner_requests": {"pending": 3, "approved": 14, "rejected": 2},
        },
    )

    response = client.get("/api/v1/admin/dashboard/metrics")

    assert response.status_code == 200
    payload = response.json()
    assert payload["analytics"]["registered_accounts"] == 303
    assert payload["bookings"]["total"] == 100
    assert payload["payments"]["paid_amount_vnd"] == 12500000


def test_get_admin_audit_logs_endpoint(  # type: ignore[no-untyped-def]
    client: TestClient, monkeypatch
) -> None:
    app.dependency_overrides[require_admin] = _admin
    now = datetime(2026, 5, 28, 9, 0, tzinfo=UTC)

    monkeypatch.setattr(
        "app.api.admin_operations.list_admin_audit_logs",
        lambda **_: [
            {
                "id": "log-id",
                "actor_user_id": "admin-user-id",
                "actor_email": "admin@netup.dev",
                "actor_full_name": "Admin",
                "event_type": "admin_config_updated",
                "entity_type": "admin_config",
                "entity_id": "1",
                "payload": {"changed_fields": ["deposit_percent"]},
                "created_at": now,
            }
        ],
    )

    response = client.get("/api/v1/admin/audit-logs?limit=20&entity_type=admin_config")

    assert response.status_code == 200
    payload = response.json()
    assert len(payload) == 1
    assert payload[0]["event_type"] == "admin_config_updated"
