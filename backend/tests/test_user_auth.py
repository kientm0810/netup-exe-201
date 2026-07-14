from __future__ import annotations

from fastapi.testclient import TestClient

from app.services.user_auth import UserPrincipal, create_user_access_token


def test_user_me_with_bearer_token(client: TestClient) -> None:
    user = UserPrincipal(
        id="user-id",
        email="player@example.com",
        full_name="Người chơi thử nghiệm",
        avatar_url=None,
        roles=["player"],
    )
    token = create_user_access_token(user)

    response = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})

    assert response.status_code == 200
    assert response.json() == {
        "id": "user-id",
        "email": "player@example.com",
        "full_name": "Người chơi thử nghiệm",
        "avatar_url": None,
        "roles": ["player"],
    }


def test_user_me_rejects_missing_token(client: TestClient) -> None:
    response = client.get("/api/v1/auth/me", headers={"X-Request-ID": "missing-user"})

    assert response.status_code == 401
    assert response.json()["error"]["code"] == "user_unauthorized"


def test_local_login_sets_user_cookies(client: TestClient, monkeypatch) -> None:  # type: ignore[no-untyped-def]
    user = UserPrincipal(
        id="owner-id",
        email="club@example.com",
        full_name="CLB thử nghiệm",
        avatar_url=None,
        roles=["owner"],
    )
    monkeypatch.setattr(
        "app.api.auth_user.authenticate_local_user",
        lambda **_: {
            "access_token": "owner-access-token",
            "refresh_token": "owner-refresh-token",
            "token_type": "bearer",
            "expires_in": 1800,
            "user": user,
        },
    )

    response = client.post(
        "/api/v1/auth/local/login",
        json={"username": "club", "password": "strong-password"},
    )

    assert response.status_code == 200
    assert response.json()["user"]["roles"] == ["owner"]
    assert "netup_user_access_token=owner-access-token" in response.headers["set-cookie"]


def test_google_start_redirects_when_configured(
    client: TestClient, monkeypatch
) -> None:  # type: ignore[no-untyped-def]
    monkeypatch.setenv("GOOGLE_CLIENT_ID", "client-id")
    monkeypatch.setenv("GOOGLE_CLIENT_SECRET", "client-secret")
    monkeypatch.setenv("GOOGLE_REDIRECT_URI", "http://localhost:8000/api/v1/auth/google/callback")

    from app.core.config import get_settings

    get_settings.cache_clear()
    response = client.get("/api/v1/auth/google/start", follow_redirects=False)

    assert response.status_code == 307
    assert "https://accounts.google.com/o/oauth2/v2/auth" in response.headers["location"]
    assert "client_id=client-id" in response.headers["location"]


def test_google_callback_sets_user_cookies(
    client: TestClient, monkeypatch
) -> None:  # type: ignore[no-untyped-def]
    user = UserPrincipal(
        id="user-id",
        email="player@example.com",
        full_name="Người chơi thử nghiệm",
        avatar_url=None,
        roles=["player"],
    )

    monkeypatch.setenv("FRONTEND_BASE_URL", "http://localhost:3000")
    from app.core.config import get_settings

    get_settings.cache_clear()
    monkeypatch.setattr(
        "app.api.auth_google.decode_signed_token",
        lambda *_args, **_kwargs: {"sub": "google-oauth"},
    )
    monkeypatch.setattr(
        "app.api.auth_google.authenticate_google_code",
        lambda **_kwargs: {
            "access_token": "access-token",
            "refresh_token": "refresh-token",
            "expires_in": 1800,
            "user": user,
        },
    )

    response = client.get(
        "/api/v1/auth/google/callback?code=test-code&state=test-state",
        follow_redirects=False,
    )

    assert response.status_code == 307
    assert response.headers["location"] == "http://localhost:3000/auth/google/callback?status=success"
    assert "netup_user_access_token=access-token" in response.headers["set-cookie"]
