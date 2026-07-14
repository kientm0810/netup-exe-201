from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_env: str = "development"
    database_url: str = "postgresql+psycopg://netup:netup@localhost:5432/netup"
    redis_url: str = "redis://localhost:6379/0"
    cors_origins: str = "http://localhost:3000"
    frontend_base_url: str = "http://localhost:3000"
    app_secret_key: str = "dev-only-change-me"
    user_access_token_minutes: int = 30
    user_refresh_token_days: int = 30
    admin_access_token_minutes: int = 30
    admin_refresh_token_days: int = 14
    admin_login_max_attempts: int = 5
    admin_login_window_minutes: int = 15
    admin_login_block_minutes: int = 15
    auth_cookie_secure: bool = False
    admin_seed_enabled: bool = False
    admin_seed_email: str = "admin@netup.local"
    admin_seed_username: str = "admin"
    admin_seed_password: str = "admin12345"
    user_import_enabled: bool = False
    user_import_source_path: str = "/app/new_user.txt"
    google_client_id: str = ""
    google_client_secret: str = ""
    google_redirect_uri: str = "http://localhost:8000/api/v1/auth/google/callback"
    backend_base_url: str = "http://localhost:8000"
    vnpay_payment_url: str = "https://sandbox.vnpayment.vn/paymentv2/vpcpay.html"
    vnpay_tmn_code: str = ""
    vnpay_hash_secret: str = ""
    vnpay_return_url: str = ""
    vnpay_locale: str = "vn"
    vnpay_order_type: str = "other"
    gemini_api_key: str = ""
    gemini_model: str = "gemini-2.5-flash-lite"
    gemini_timeout_seconds: int = 45
    video_assessment_max_size_mb: int = 5
    video_assessment_max_duration_seconds: int = 60
    video_assessment_storage_dir: str = "/tmp/netup-video-assessments"
    local_upload_storage_dir: str = "/app/uploads"

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @property
    def cors_origins_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
