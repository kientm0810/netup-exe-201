from __future__ import annotations

from urllib.parse import quote_plus

from sqlalchemy import text

from app.core.config import get_settings
from app.core.security import hash_password
from app.db.session import get_engine


def main() -> None:
    settings = get_settings()
    if not settings.admin_seed_enabled:
        return

    full_name = "Quản trị viên NetUp"
    avatar_url = (
        "https://ui-avatars.com/api/?name="
        f"{quote_plus(full_name)}"
        "&background=4285F4&color=fff&size=96&bold=true&rounded=true&format=png&length=2"
    )
    engine = get_engine()
    with engine.begin() as connection:
        user_id = connection.execute(
            text(
                """
                INSERT INTO public.users (email, full_name, avatar_url)
                VALUES (:email, :full_name, :avatar_url)
                ON CONFLICT (email) DO UPDATE
                SET full_name = EXCLUDED.full_name,
                    avatar_url = COALESCE(
                      NULLIF(public.users.avatar_url, ''),
                      EXCLUDED.avatar_url
                    )
                RETURNING id
                """
            ),
            {
                "email": settings.admin_seed_email,
                "full_name": full_name,
                "avatar_url": avatar_url,
            },
        ).scalar_one()

        connection.execute(
            text(
                """
                INSERT INTO public.user_role_assignments (user_id, role, reason)
                VALUES (:user_id, 'admin', 'dev seed admin')
                ON CONFLICT DO NOTHING
                """
            ),
            {"user_id": user_id},
        )

        connection.execute(
            text(
                """
                INSERT INTO public.admin_accounts
                  (user_id, username, password_hash, is_super_admin)
                VALUES (:user_id, :username, :password_hash, true)
                ON CONFLICT (username) DO NOTHING
                """
            ),
            {
                "user_id": user_id,
                "username": settings.admin_seed_username,
                "password_hash": hash_password(settings.admin_seed_password),
            },
        )


if __name__ == "__main__":
    main()
