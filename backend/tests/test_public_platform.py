from __future__ import annotations

from datetime import UTC, datetime

from fastapi.testclient import TestClient


def test_platform_stats_endpoint(client: TestClient, monkeypatch) -> None:  # type: ignore[no-untyped-def]
    monkeypatch.setattr(
        "app.api.public_platform.get_platform_stats",
        lambda: {
            "users_total": 12,
            "active_owners": 3,
            "active_courts": 9,
            "upcoming_sessions": 15,
            "completed_bookings": 22,
        },
    )

    response = client.get("/api/v1/public/platform-stats")

    assert response.status_code == 200
    assert response.json()["active_courts"] == 9
    assert response.json()["upcoming_sessions"] == 15


def test_create_contact_lead_endpoint(client: TestClient, monkeypatch) -> None:  # type: ignore[no-untyped-def]
    created_at = datetime(2026, 6, 10, 8, 0, tzinfo=UTC)

    def fake_create_contact_lead(**kwargs):  # type: ignore[no-untyped-def]
        assert kwargs["data"]["full_name"] == "Nguyen Van A"
        assert kwargs["data"]["organization_name"] == "NetUp Arena"
        assert kwargs["data"]["source"] == "contact_page"
        return {"id": "lead-id", "status": "new", "created_at": created_at}

    monkeypatch.setattr("app.api.public_platform.create_contact_lead", fake_create_contact_lead)

    response = client.post(
        "/api/v1/public/contact-leads",
        json={
            "fullName": "Nguyen Van A",
            "phone": "0900000000",
            "email": "partner@example.com",
            "partnerType": "owner",
            "organizationName": "NetUp Arena",
            "address": "Hoa Lac",
            "message": "Can tu van",
            "source": "contact_page",
        },
    )

    assert response.status_code == 201
    assert response.json()["id"] == "lead-id"


def test_record_website_visit_endpoint(client: TestClient, monkeypatch) -> None:  # type: ignore[no-untyped-def]
    tracked_at = datetime(2026, 7, 14, 8, 30, tzinfo=UTC)

    def fake_record_website_visit(**kwargs):  # type: ignore[no-untyped-def]
        assert kwargs == {
            "visitor_key": "visitor-12345678",
            "session_key": "session-12345678",
            "path": "/player/discovery",
            "user_id": None,
        }
        return {
            "ok": True,
            "session_id": "visit-session-id",
            "started_at": tracked_at,
            "last_seen_at": tracked_at,
            "page_view_count": 1,
        }

    monkeypatch.setattr(
        "app.api.public_platform.record_website_visit",
        fake_record_website_visit,
    )

    response = client.post(
        "/api/v1/public/analytics/visit",
        json={
            "visitor_key": "visitor-12345678",
            "session_key": "session-12345678",
            "path": "/player/discovery",
        },
    )

    assert response.status_code == 201
    assert response.json()["page_view_count"] == 1
