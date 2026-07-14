from __future__ import annotations

from datetime import UTC, datetime

from fastapi.testclient import TestClient

from app.core.dependencies import require_admin, require_owner, require_player
from app.main import app
from app.services.admin_auth import AdminPrincipal
from app.services.user_auth import UserPrincipal


def _clear_overrides() -> None:
    app.dependency_overrides.clear()


def setup_function() -> None:  # type: ignore[no-untyped-def]
    _clear_overrides()


def teardown_function() -> None:  # type: ignore[no-untyped-def]
    _clear_overrides()


def _player() -> UserPrincipal:
    return UserPrincipal(
        id="player-id",
        email="player@example.com",
        full_name="Nguoi choi",
        avatar_url=None,
        roles=["player"],
    )


def _owner() -> UserPrincipal:
    return UserPrincipal(
        id="owner-id",
        email="owner@example.com",
        full_name="Chu san",
        avatar_url=None,
        roles=["player", "owner"],
    )


def _admin() -> AdminPrincipal:
    return AdminPrincipal(
        id="admin-id",
        user_id="admin-user-id",
        username="admin",
        is_super_admin=True,
    )


def test_player_endpoints_smoke(  # type: ignore[no-untyped-def]
    client: TestClient, monkeypatch
) -> None:
    app.dependency_overrides[require_player] = _player
    now = datetime(2026, 6, 1, 8, 0, tzinfo=UTC)

    monkeypatch.setattr(
        "app.api.player_booking.list_discovery_sessions",
        lambda **_: [
            {
                "id": "session-id",
                "court_id": "court-id",
                "title": "Keo sang",
                "post_type": "pool",
                "status": "scheduled",
                "starts_at": now,
                "duration_minutes": 60,
                "ends_at": now,
                "open_slots": 3,
                "max_slots": 4,
                "required_skill_min": "Beginner",
                "required_skill_max": "Advanced",
                "slot_price_vnd": 90000,
                "full_court_price_vnd": 360000,
                "is_peak_hour": False,
                "allows_solo_join": True,
                "court_name": "San 1",
                "sub_court_name": "A",
                "sport": "Badminton",
                "amenities": [],
                "base_price_vnd": 120000,
                "complex_id": "complex-id",
                "complex_name": "NetUp Arena",
                "district": "Ha Dong",
                "address": "Ha Noi",
                "latitude": None,
                "longitude": None,
            }
        ],
    )

    monkeypatch.setattr("app.api.player_booking.list_my_bookings", lambda **_: [])

    assert client.get("/api/v1/player/discovery/sessions").status_code == 200
    assert client.get("/api/v1/player/bookings").status_code == 200


def test_owner_endpoints_smoke(  # type: ignore[no-untyped-def]
    client: TestClient, monkeypatch
) -> None:
    app.dependency_overrides[require_owner] = _owner

    monkeypatch.setattr("app.api.owner_inventory.list_sessions", lambda **_: [])
    monkeypatch.setattr("app.api.owner_checkins.list_owner_checkins", lambda **_: [])

    assert client.get("/api/v1/owner/sessions").status_code == 200
    assert client.get("/api/v1/owner/checkins").status_code == 200


def test_admin_endpoints_smoke(  # type: ignore[no-untyped-def]
    client: TestClient, monkeypatch
) -> None:
    app.dependency_overrides[require_admin] = _admin
    now = datetime(2026, 6, 1, 9, 0, tzinfo=UTC)

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
    monkeypatch.setattr(
        "app.api.admin_operations.get_admin_dashboard_metrics",
        lambda **_: {
            "analytics": {
                "total_website_visits": 0,
                "new_users": 0,
                "registered_accounts": 0,
                "active_users": 0,
                "returning_users": 0,
                "seeded_visits": 0,
                "is_estimated": False,
                "period_days": 30,
                "generated_at": now,
                "daily": [],
            },
            "bookings": {
                "total": 0,
                "awaiting_deposit": 0,
                "checked_in": 0,
                "completed": 0,
                "last_7d": 0,
            },
            "payments": {
                "total": 0,
                "paid": 0,
                "processing": 0,
                "paid_amount_vnd": 0,
            },
            "checkins": {"total": 0, "last_7d": 0},
            "owner_requests": {"pending": 0, "approved": 0, "rejected": 0},
        },
    )
    monkeypatch.setattr("app.api.admin_operations.list_admin_audit_logs", lambda **_: [])

    assert client.get("/api/v1/admin/config").status_code == 200
    assert client.get("/api/v1/admin/dashboard/metrics").status_code == 200
    assert client.get("/api/v1/admin/audit-logs").status_code == 200
