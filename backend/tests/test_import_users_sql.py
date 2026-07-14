from __future__ import annotations

import pytest

from app.scripts.import_users import load_candidates


def test_import_reads_production_tsv_without_synthetic_profiles(tmp_path) -> None:  # type: ignore[no-untyped-def]
    source = tmp_path / "new_user.txt"
    source.write_text(
        "HE160684\tNguyễn\tĐức\tĐoàn\nHS180646\tNguyễn\t\tCường\n",
        encoding="utf-8",
    )

    candidates = load_candidates(source)

    assert [candidate.student_code for candidate in candidates] == ["HE160684", "HS180646"]
    assert candidates[0].full_name == "Nguyễn Đức Đoàn"
    assert candidates[1].full_name == "Nguyễn Cường"
    assert candidates[0].email == "he160684@fpt.edu.vn"
    assert "ui-avatars.com" in candidates[0].avatar_url


def test_import_rejects_future_student_cohorts_and_duplicate_codes(tmp_path) -> None:  # type: ignore[no-untyped-def]
    source = tmp_path / "new_user.txt"
    source.write_text("HE190001\tNguyễn\tVăn\tA\n", encoding="utf-8")

    with pytest.raises(ValueError, match="không hợp lệ"):
        load_candidates(source)

    source.write_text(
        "HE180001\tNguyễn\tVăn\tA\nHE180001\tTrần\tVăn\tB\n",
        encoding="utf-8",
    )
    with pytest.raises(ValueError, match="trùng mã sinh viên"):
        load_candidates(source)
