from __future__ import annotations

from pathlib import Path


def test_user_import_is_append_only_and_caps_the_demo_population() -> None:
    sql = Path("database/import_users.sql").read_text(encoding="utf-8")
    normalized = " ".join(sql.lower().split())

    assert "delete from public.users" not in normalized
    assert "update public.users" not in normalized
    assert "truncate public.users" not in normalized
    assert "on conflict (email) do update" not in normalized
    assert "on conflict (email) do nothing" in normalized
    assert "new_user.txt (52 supplied users) + 232 deterministic demo users" in sql
    assert "20 common Vietnamese surnames x 5 curated name profiles = 100" in sql
    assert "These 132 deterministic profiles" in sql
    assert "greatest(0, 303 - count(*))" in normalized
    assert "https://ui-avatars.com/api/?name=" in sql
    assert "HE20" not in sql
    assert "HE190009" not in sql
    assert "HE194070" not in sql
    assert "HE201969" not in sql
