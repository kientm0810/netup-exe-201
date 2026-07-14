from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import quote_plus

import psycopg

from app.core.config import get_settings

STUDENT_CODE_PATTERN = re.compile(r"^(?:HE|HS)1[6-8]\d{4}$", re.IGNORECASE)


@dataclass(frozen=True)
class UserCandidate:
    student_code: str
    full_name: str
    email: str
    avatar_url: str


def _avatar_url(full_name: str) -> str:
    return (
        "https://ui-avatars.com/api/?name="
        f"{quote_plus(full_name)}"
        "&background=4285F4&color=fff&size=96&bold=true&rounded=true&format=png&length=2"
    )


def load_candidates(source_path: Path) -> list[UserCandidate]:
    """Read the production-owned TSV without fabricating additional users."""
    if not source_path.exists():
        raise FileNotFoundError(f"Không tìm thấy file import: {source_path}")

    candidates: list[UserCandidate] = []
    seen_codes: set[str] = set()
    for line_number, raw_line in enumerate(
        source_path.read_text(encoding="utf-8").splitlines(), start=1
    ):
        if not raw_line.strip():
            continue
        fields = raw_line.split("\t")
        if len(fields) != 4:
            raise ValueError(
                f"Dòng {line_number} phải có 4 cột tab: mã SV, họ, tên đệm, tên"
            )

        student_code = fields[0].strip().upper()
        if not STUDENT_CODE_PATTERN.fullmatch(student_code):
            raise ValueError(
                f"Dòng {line_number} có mã sinh viên không hợp lệ: {student_code}"
            )
        if student_code in seen_codes:
            raise ValueError(f"Dòng {line_number} trùng mã sinh viên: {student_code}")

        full_name = " ".join(field.strip() for field in fields[1:] if field.strip())
        if not full_name:
            raise ValueError(f"Dòng {line_number} thiếu họ tên")

        seen_codes.add(student_code)
        candidates.append(
            UserCandidate(
                student_code=student_code,
                full_name=full_name,
                email=f"{student_code.lower()}@fpt.edu.vn",
                avatar_url=_avatar_url(full_name),
            )
        )
    return candidates


def import_candidates(*, database_url: str, candidates: list[UserCandidate]) -> int:
    if not candidates:
        return 0

    records = [
        (candidate.student_code, candidate.full_name, candidate.email, candidate.avatar_url)
        for candidate in candidates
    ]
    with psycopg.connect(database_url) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                CREATE TEMP TABLE import_user_candidates (
                  student_code text PRIMARY KEY,
                  full_name text NOT NULL,
                  email citext NOT NULL UNIQUE,
                  avatar_url text NOT NULL
                ) ON COMMIT DROP
                """
            )
            cursor.executemany(
                """
                INSERT INTO import_user_candidates (
                  student_code, full_name, email, avatar_url
                )
                VALUES (%s, %s, %s, %s)
                """,
                records,
            )
            cursor.execute(
                """
                CREATE TEMP TABLE imported_users (
                  id uuid PRIMARY KEY,
                  email citext NOT NULL UNIQUE,
                  student_code text NOT NULL
                ) ON COMMIT DROP
                """
            )
            cursor.execute(
                """
                WITH new_candidates AS (
                  SELECT candidate.*
                  FROM import_user_candidates candidate
                  WHERE NOT EXISTS (
                    SELECT 1
                    FROM public.users existing
                    WHERE existing.email = candidate.email
                       OR lower(existing.email::text) LIKE
                          '%' || lower(candidate.student_code) || '@fpt.edu.vn'
                  )
                ), inserted AS (
                  INSERT INTO public.users (
                    email,
                    full_name,
                    avatar_url,
                    city,
                    district,
                    is_active
                  )
                  SELECT
                    email,
                    full_name,
                    avatar_url,
                    'Hà Nội',
                    'Thạch Thất',
                    true
                  FROM new_candidates
                  ON CONFLICT (email) DO NOTHING
                  RETURNING id, email
                )
                INSERT INTO imported_users (id, email, student_code)
                SELECT inserted.id, inserted.email, candidate.student_code
                FROM inserted
                JOIN import_user_candidates candidate ON candidate.email = inserted.email
                """
            )
            cursor.execute(
                """
                INSERT INTO public.user_role_assignments (user_id, role, reason)
                SELECT id, 'player', 'production user import'
                FROM imported_users
                ON CONFLICT DO NOTHING
                """
            )
            cursor.execute(
                """
                INSERT INTO public.elo_ratings (
                  player_user_id,
                  elo_value,
                  visible_skill_tier,
                  matches_played,
                  wins,
                  losses,
                  draws
                )
                SELECT id, 1000, 'Beginner', 0, 0, 0, 0
                FROM imported_users
                ON CONFLICT (player_user_id) DO NOTHING
                """
            )
            cursor.execute("SELECT count(*)::int FROM imported_users")
            inserted_count = int(cursor.fetchone()[0])
    return inserted_count


def main() -> None:
    settings = get_settings()
    if not settings.user_import_enabled:
        print("Bulk user import disabled; skipping.")
        return

    candidates = load_candidates(Path(settings.user_import_source_path))
    database_url = settings.database_url.replace("postgresql+psycopg://", "postgresql://", 1)
    inserted_count = import_candidates(database_url=database_url, candidates=candidates)
    print(
        "Production user import completed: "
        f"candidates={len(candidates)}, inserted={inserted_count}, "
        f"skipped_existing={len(candidates) - inserted_count}."
    )


if __name__ == "__main__":
    main()
