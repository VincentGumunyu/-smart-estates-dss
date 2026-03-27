"""Create a demo Supabase Auth user (email/password) via service role key.

Usage:
  set SUPABASE_URL=https://YOUR_PROJECT.supabase.co
  set SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY
  set DEMO_EMAIL=demo@smartestates.local
  set DEMO_PASSWORD=ChangeMe123!
  python scripts/create_demo_login.py
"""

from __future__ import annotations

import os
from pathlib import Path

from supabase import create_client

ROOT = Path(__file__).resolve().parents[1]


def load_root_env() -> None:
    env_path = ROOT / ".env"
    if not env_path.exists():
        return
    try:
        text = env_path.read_text(encoding="utf-8-sig")
    except OSError:
        return
    for raw in text.splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, val = line.partition("=")
        key = key.strip()
        val = val.strip().strip('"').strip("'")
        if "#" in val:
            val = val.split("#", 1)[0].strip()
        if key and val and key not in os.environ:
            os.environ[key] = val


def main() -> None:
    load_root_env()
    url = os.environ.get("SUPABASE_URL", "").strip()
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    email = os.environ.get("DEMO_EMAIL", "demo@smartestates.local").strip()
    password = os.environ.get("DEMO_PASSWORD", "ChangeMe123!").strip()

    if not url or not key:
        raise SystemExit("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY first.")
    if len(password) < 8:
        raise SystemExit("DEMO_PASSWORD must be at least 8 characters.")

    client = create_client(url, key)
    # Try create; if already exists, update password/confirmation state.
    try:
        created = client.auth.admin.create_user(
            {
                "email": email,
                "password": password,
                "email_confirm": True,
            }
        )
        user_id = created.user.id if getattr(created, "user", None) else "(unknown)"
        print(f"Created demo user: {email} (id: {user_id})")
    except Exception:
        users = client.auth.admin.list_users()
        existing = None
        for u in getattr(users, "users", []) or []:
            if (getattr(u, "email", "") or "").lower() == email.lower():
                existing = u
                break
        if not existing:
            raise
        client.auth.admin.update_user_by_id(
            existing.id,
            {
                "password": password,
                "email_confirm": True,
            },
        )
        print(f"Updated existing demo user: {email} (id: {existing.id})")


if __name__ == "__main__":
    main()

