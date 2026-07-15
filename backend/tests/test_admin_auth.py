from __future__ import annotations

from fastapi.testclient import TestClient

from app.services.admin_auth import AdminPrincipal


def test_admin_login_success(client: TestClient, monkeypatch) -> None:  # type: ignore[no-untyped-def]
    admin = AdminPrincipal(
        id="admin-account-id",
        user_id="user-id",
        username="admin",
        is_super_admin=True,
    )

    monkeypatch.setattr(
        "app.api.admin_auth.authenticate_admin",
        lambda **_: {
            "access_token": "access",
            "refresh_token": "refresh",
            "token_type": "bearer",
            "expires_in": 1800,
            "admin": admin,
        },
    )

    response = client.post(
        "/api/v1/admin/auth/login",
        json={"username": "admin", "password": "admin12345"},
    )

    assert response.status_code == 200
    assert response.json()["access_token"] == "access"
    assert response.json()["admin"]["username"] == "admin"


def test_admin_login_failure_uses_standard_error(client: TestClient, monkeypatch) -> None:  # type: ignore[no-untyped-def]
    monkeypatch.setattr("app.api.admin_auth.authenticate_admin", lambda **_: None)

    response = client.post(
        "/api/v1/admin/auth/login",
        json={"username": "admin", "password": "wrong"},
        headers={"X-Request-ID": "login-failed"},
    )

    assert response.status_code == 401
    assert response.json() == {
        "error": {
            "code": "admin_login_failed",
            "message": "Tên đăng nhập hoặc mật khẩu không đúng",
            "request_id": "login-failed",
        }
    }


def test_admin_me_requires_bearer_token(client: TestClient) -> None:
    response = client.get("/api/v1/admin/auth/me", headers={"X-Request-ID": "missing-token"})

    assert response.status_code == 401
    assert response.json()["error"]["code"] == "admin_unauthorized"
