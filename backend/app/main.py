from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.api.admin_auth import router as admin_auth_router
from app.api.admin_operations import router as admin_operations_router
from app.api.admin_owner_quotas import router as admin_owner_quotas_router
from app.api.admin_owner_requests import router as admin_owner_requests_router
from app.api.admin_owners import router as admin_owners_router
from app.api.auth_google import router as auth_google_router
from app.api.auth_user import router as auth_user_router
from app.api.health import router as health_router
from app.api.owner_checkins import router as owner_checkins_router
from app.api.owner_commerce import owner_router as owner_commerce_router
from app.api.owner_commerce import player_router as player_bills_router
from app.api.owner_inventory import router as owner_inventory_router
from app.api.owner_requests import router as owner_requests_router
from app.api.player_assessment import router as player_assessment_router
from app.api.player_booking import router as player_booking_router
from app.api.player_chat import router as player_chat_router
from app.api.player_chat import ws_router as player_chat_ws_router
from app.api.player_matches import router as player_matches_router
from app.api.player_payments import router as player_payments_router
from app.api.player_profiles import router as player_profiles_router
from app.api.player_tournaments import admin_router as admin_tournaments_router
from app.api.player_tournaments import player_router as player_tournaments_router
from app.api.player_tournaments import public_router as public_tournaments_router
from app.api.public_discovery import router as public_discovery_router
from app.api.public_platform import router as public_platform_router
from app.core.config import get_settings
from app.core.errors import register_error_handlers
from app.core.logging import configure_logging
from app.core.middleware import RequestIdMiddleware
from app.services.cron import generate_daily_sessions

logger = logging.getLogger(__name__)

async def background_cron_task():
    while True:
        try:
            logger.info("Running daily session generation cron task...")
            # Run in a threadpool to avoid blocking event loop
            count = await asyncio.to_thread(generate_daily_sessions, 30)
            logger.info(f"Daily session generation completed. Created {count} sessions.")
        except Exception as e:
            logger.error(f"Error in background_cron_task: {e}")
        
        # Sleep for 24 hours
        await asyncio.sleep(86400)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    task = asyncio.create_task(background_cron_task())
    yield
    # Shutdown
    task.cancel()


def create_app() -> FastAPI:
    settings = get_settings()
    configure_logging(settings.app_env)

    app = FastAPI(
        title="NetUp API",
        version="0.1.0",
        docs_url="/api/docs",
        redoc_url="/api/redoc",
        openapi_url="/api/openapi.json",
        lifespan=lifespan,
    )

    app.add_middleware(RequestIdMiddleware)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    register_error_handlers(app)
    uploads_dir = Path(settings.local_upload_storage_dir)
    uploads_dir.mkdir(parents=True, exist_ok=True)
    app.mount("/uploads", StaticFiles(directory=str(uploads_dir)), name="uploads")

    app.include_router(auth_google_router, prefix="/api/v1")
    app.include_router(auth_user_router, prefix="/api/v1")
    app.include_router(admin_auth_router, prefix="/api/v1")
    app.include_router(admin_operations_router, prefix="/api/v1")
    app.include_router(admin_owner_quotas_router, prefix="/api/v1")
    app.include_router(admin_owners_router, prefix="/api/v1")
    app.include_router(owner_requests_router, prefix="/api/v1")
    app.include_router(admin_owner_requests_router, prefix="/api/v1")
    app.include_router(owner_inventory_router, prefix="/api/v1")
    app.include_router(owner_checkins_router, prefix="/api/v1")
    app.include_router(owner_commerce_router, prefix="/api/v1")
    app.include_router(player_booking_router, prefix="/api/v1")
    app.include_router(player_assessment_router, prefix="/api/v1")
    app.include_router(player_matches_router, prefix="/api/v1")
    app.include_router(player_chat_router, prefix="/api/v1")
    app.include_router(player_payments_router, prefix="/api/v1")
    app.include_router(player_profiles_router, prefix="/api/v1")
    app.include_router(public_tournaments_router, prefix="/api/v1")
    app.include_router(player_tournaments_router, prefix="/api/v1")
    app.include_router(admin_tournaments_router, prefix="/api/v1")
    app.include_router(public_discovery_router, prefix="/api/v1")
    app.include_router(public_platform_router, prefix="/api/v1")
    app.include_router(player_bills_router, prefix="/api/v1")
    app.include_router(health_router, prefix="/api/v1")
    app.include_router(player_chat_ws_router)

    return app


app = create_app()
