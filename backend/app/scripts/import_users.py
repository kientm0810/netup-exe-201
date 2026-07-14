from __future__ import annotations

from pathlib import Path

import psycopg

from app.core.config import get_settings
from app.services.web_analytics import SEED_MISSING_USER_ANALYTICS_SQL


def main() -> None:
    settings = get_settings()
    if not settings.user_import_enabled:
        print("Bulk user import disabled; skipping.")
        return

    sql_path = Path(settings.user_import_sql_path)
    if not sql_path.exists():
        print(f"Bulk user import SQL not found at {sql_path}; skipping.")
        return

    database_url = settings.database_url.replace("postgresql+psycopg://", "postgresql://", 1)
    sql = sql_path.read_text(encoding="utf-8")

    import_summary: tuple[object, ...] | None = None
    with psycopg.connect(database_url, autocommit=True) as connection:
        with connection.cursor() as cursor:
            cursor.execute(sql)
            while True:
                if cursor.description is not None:
                    row = cursor.fetchone()
                    if row is not None and len(row) == 5:
                        import_summary = tuple(row)
                if not cursor.nextset():
                    break

            # Migrations run before this script in the container entrypoint.
            # Seed only accounts without analytics rows, including users that
            # were inserted by the append-only SQL immediately above.
            cursor.execute(SEED_MISSING_USER_ANALYTICS_SQL)

    if import_summary is None:
        print(f"Bulk user import completed from {sql_path}.")
        return

    candidate_count, supplied_count, synthetic_count, inserted_count, not_inserted_count = (
        import_summary
    )
    print(
        "Bulk user import completed: "
        f"candidates={candidate_count}, supplied={supplied_count}, "
        f"synthetic={synthetic_count}, inserted={inserted_count}, "
        f"not_inserted={not_inserted_count}."
    )


if __name__ == "__main__":
    main()
