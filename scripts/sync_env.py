#!/usr/bin/env python3
from __future__ import annotations

from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
ROOT_ENV = ROOT / ".env"
BACKEND_ENV = ROOT / "backend" / ".env"
FRONTEND_ENV = ROOT / "frontend" / ".env"


def read_env(path: Path) -> list[str]:
    if not path.exists():
        example = path.with_name(".env.example")
        return example.read_text().splitlines() if example.exists() else []
    return path.read_text().splitlines()


def parse_env(lines: list[str]) -> dict[str, str]:
    values: dict[str, str] = {}
    for line in lines:
        if not line or line.lstrip().startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip()
    return values


def upsert(lines: list[str], updates: dict[str, str]) -> list[str]:
    seen: set[str] = set()
    next_lines: list[str] = []
    for line in lines:
        if not line or line.lstrip().startswith("#") or "=" not in line:
            next_lines.append(line)
            continue

        key, _value = line.split("=", 1)
        key = key.strip()
        if key in updates:
            if key in seen:
                continue
            next_lines.append(f"{key}={updates[key]}")
            seen.add(key)
        else:
            next_lines.append(line)

    missing = [key for key in updates if key not in seen]
    if missing:
        if next_lines and next_lines[-1] != "":
            next_lines.append("")
        next_lines.extend(f"{key}={updates[key]}" for key in missing)

    return next_lines


def write_env(path: Path, updates: dict[str, str]) -> None:
    path.write_text("\n".join(upsert(read_env(path), updates)).rstrip() + "\n")


def resolve_target(raw_target: str) -> tuple[str, str, str, str]:
    target = raw_target.strip()
    if target.lower() in {"", "local", "localhost"}:
        return "localhost", "development", "http://localhost:3000", "http://localhost:8000"

    target_to_write = target.rstrip("/")
    public_base_url = target_to_write
    if not public_base_url.startswith(("http://", "https://")):
        public_base_url = f"http://{public_base_url}"
    public_base_url = public_base_url.rstrip("/")
    return target_to_write, "production", public_base_url, public_base_url


def main() -> None:
    root_values = parse_env(read_env(ROOT_ENV))
    target, app_env, public_base_url, api_base_url = resolve_target(
        root_values.get("NETUP_ENV_TARGET", "localhost")
    )
    auth_cookie_secure = "true" if api_base_url.startswith("https://") else "false"

    write_env(
        ROOT_ENV,
        {
            "NETUP_ENV_TARGET": target,
            "PUBLIC_BASE_URL": public_base_url,
            "NEXT_PUBLIC_API_BASE_URL": api_base_url,
        },
    )
    write_env(
        BACKEND_ENV,
        {
            "APP_ENV": app_env,
            "CORS_ORIGINS": public_base_url,
            "FRONTEND_BASE_URL": public_base_url,
            "BACKEND_BASE_URL": api_base_url,
            "GOOGLE_REDIRECT_URI": f"{api_base_url}/api/v1/auth/google/callback",
            "VNPAY_RETURN_URL": f"{api_base_url}/api/v1/payments/vnpay/return",
            "AUTH_COOKIE_SECURE": auth_cookie_secure,
        },
    )
    write_env(
        FRONTEND_ENV,
        {
            "NEXT_PUBLIC_API_BASE_URL": api_base_url,
            "NEXT_PUBLIC_NETUP_FACEBOOK_URL": root_values.get(
                "NEXT_PUBLIC_NETUP_FACEBOOK_URL", "https://www.facebook.com/netup68"
            ),
        },
    )

    print(f"Synced env files for NETUP_ENV_TARGET={target}")
    print(f"Frontend base URL: {public_base_url}")
    print(f"API base URL: {api_base_url}")


if __name__ == "__main__":
    main()
