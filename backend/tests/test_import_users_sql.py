from __future__ import annotations

from pathlib import Path


def test_user_import_is_append_only_and_has_expected_candidate_counts() -> None:
    sql = Path("database/import_users.sql").read_text(encoding="utf-8")
    normalized = " ".join(sql.lower().split())

    assert "delete from public.users" not in normalized
    assert "update public.users" not in normalized
    assert "truncate public.users" not in normalized
    assert "on conflict (email) do update" not in normalized
    assert "on conflict (email) do nothing" in normalized
    assert "new_user.txt (52 supplied users)" in sql
    assert "20 common Vietnamese surnames x 5 curated name profiles = 100" in sql
    assert "https://lh3.googleusercontent.com/a/ACg8ocLoV_" in sql
