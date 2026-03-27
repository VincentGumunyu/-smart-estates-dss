"""
AI insights API for Smart Estates DSS. From the folder that contains this file:

  pip install -r requirements-ai.txt
  python -m uvicorn ai_api:app --host 127.0.0.1 --port 8765

Or:  python ai_api.py   (same thing — starts the server on port 8765)

Dashboard dev server proxies /api -> http://127.0.0.1:8765 (see dashboard/vite.config.mjs).

Easiest on Windows: copy .env.example to .env and put your key on the OPENAI_API_KEY line,
then restart uvicorn (the server reads .env automatically).
"""
from __future__ import annotations

import asyncio
import json
import os
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any, Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict, Field

_ENV_DIR = Path(__file__).resolve().parent


def _parse_env_file() -> dict[str, str]:
    """Read .env next to ai_api.py. Handles UTF-8 BOM and strips inline # comments from values."""
    path = _ENV_DIR / ".env"
    if not path.is_file():
        return {}
    try:
        text = path.read_text(encoding="utf-8-sig")
    except OSError:
        return {}
    out: dict[str, str] = {}
    for raw in text.splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        if "=" not in line:
            continue
        key, _, val = line.partition("=")
        key = key.strip()
        val = val.strip().strip('"').strip("'")
        if "#" in val:
            val = val.split("#", 1)[0].strip()
        if key and val:
            out[key] = val
    return out


def _apply_env_from_file() -> None:
    for key, val in _parse_env_file().items():
        os.environ[key] = val


def _normalize_openai_key(raw: str) -> str:
    k = (raw or "").strip()
    if k.lower().startswith("bearer "):
        k = k[7:].strip()
    return k.strip().strip('"').strip("'")


def refresh_env_and_openai_key() -> None:
    """Re-read .env from disk and normalize OPENAI_API_KEY (call before status / insights)."""
    _apply_env_from_file()
    k = _normalize_openai_key(os.environ.get("OPENAI_API_KEY", ""))
    if k:
        os.environ["OPENAI_API_KEY"] = k
    elif "OPENAI_API_KEY" in os.environ and not k:
        os.environ["OPENAI_API_KEY"] = ""


def _openai_key_diagnosis() -> tuple[bool, str, str]:
    """Returns (configured, reason_code, user_hint)."""
    env_path = _ENV_DIR / ".env"
    refresh_env_and_openai_key()
    k = os.environ.get("OPENAI_API_KEY", "").strip()
    parsed = _parse_env_file()
    if not env_path.is_file() and not k:
        return (
            False,
            "no_env_file",
            "No .env and OPENAI_API_KEY not set. Local: add .env next to ai_api.py. Fly.io: fly secrets set OPENAI_API_KEY=sk-...",
        )
    if env_path.is_file() and "OPENAI_API_KEY" not in parsed and not k:
        return (
            False,
            "missing_line",
            'Add a line to .env exactly: OPENAI_API_KEY=sk-yourActualKey (no spaces around =).',
        )
    if not k:
        return (
            False,
            "empty_key",
            "OPENAI_API_KEY is empty after loading .env. Remove quotes if they wrap the whole line wrong, or delete trailing spaces.",
        )
    if not k.startswith("sk-"):
        return (
            False,
            "bad_prefix",
            "Key must start with sk- (OpenAI secret key). Check you did not paste extra text before sk-.",
        )
    if len(k) < 12:
        return False, "too_short", "Key looks truncated — paste the full key from OpenAI."
    low = k.lower()
    if "your-key-here" in low or "paste-your-full-key-here" in low:
        return False, "placeholder", "Replace the placeholder with your real key from https://platform.openai.com/api-keys"
    return True, "ok", ""


_apply_env_from_file()
refresh_env_and_openai_key()

SYSTEM_PROMPT = """You are a decision-support assistant for municipal legal tuckshop / city estates officers (Gweru-style kiosk leases).

Rules:
- Use ONLY the JSON context provided. Do not invent tenant names, kiosk numbers, or dollar amounts not implied by the context.
- If "lesseeArrearsRanking" is present, you may cite those lessees and arrearsUsd values exactly when answering ranking questions.
- Output concise, actionable bullets: collections / arrears, lease compliance, operational occupancy, and analytics/collection-rate if present.
- If the user asks something the context cannot answer, say what is missing.
- This is advisory only; all enforcement decisions remain with human officers.
- Do not claim legal authority; suggest verification steps where appropriate.
"""


class OpenAIRequestError(Exception):
    def __init__(self, status_code: int, detail: str):
        self.status_code = status_code
        self.detail = detail
        super().__init__(detail)


def _call_openai_chat(key: str, payload: dict[str, Any]) -> dict[str, Any]:
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        "https://api.openai.com/v1/chat/completions",
        data=data,
        headers={
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=90) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        body = e.read().decode() if e.fp else ""
        try:
            err = json.loads(body)
            detail = str(err.get("error", {}).get("message", body))[:2000]
        except Exception:
            detail = (body or str(e.reason))[:2000]
        raise OpenAIRequestError(e.code or 502, detail) from e
    except urllib.error.URLError as e:
        raise OpenAIRequestError(502, f"OpenAI request failed: {e!s}") from e


class InsightsBody(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    user_question: Optional[str] = Field(default=None, alias="userQuestion")
    context: dict[str, Any] = Field(default_factory=dict)


# Fly image copies Vite build to ./static; local dev usually has no folder (API-only).
_SERVE_SPA = (_ENV_DIR / "static").is_dir()


def _cors_origin_regex() -> str:
    """Local Vite dev (separate port). Same Fly host = same origin, no CORS. Override: CORS_ALLOW_ORIGIN_REGEX."""
    custom = os.environ.get("CORS_ALLOW_ORIGIN_REGEX", "").strip()
    if custom:
        return custom
    return r"^http://(localhost|127\.0\.0\.1):\d+$"


app = FastAPI(
    title="Smart Estates DSS",
    docs_url="/api/docs" if _SERVE_SPA else "/docs",
    redoc_url="/api/redoc" if _SERVE_SPA else "/redoc",
    openapi_url="/api/openapi.json" if _SERVE_SPA else "/openapi.json",
)
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=_cors_origin_regex(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/ai/status")
def ai_status() -> dict[str, Any]:
    env_path = _ENV_DIR / ".env"
    configured, reason, hint = _openai_key_diagnosis()
    model = os.environ.get("OPENAI_MODEL", "gpt-4o-mini").strip() or "gpt-4o-mini"
    return {
        "ok": True,
        "openaiConfigured": configured,
        "reason": reason,
        "envFileExists": env_path.is_file(),
        "envPath": str(env_path),
        "model": model,
        "hint": hint if not configured else None,
    }


@app.post("/api/ai/insights")
async def ai_insights(body: InsightsBody) -> dict[str, str]:
    configured, reason, hint = _openai_key_diagnosis()
    if not configured:
        raise HTTPException(
            status_code=503,
            detail=f"{hint} File: {_ENV_DIR / '.env'} (code: {reason}). Re-saving .env is enough — uvicorn reload not required.",
        )
    key = os.environ.get("OPENAI_API_KEY", "").strip()

    model = os.environ.get("OPENAI_MODEL", "gpt-4o-mini").strip() or "gpt-4o-mini"
    ctx_text = json.dumps(body.context, indent=2, default=str)
    user_parts = [
        "Portfolio and analytics context (JSON):\n```json\n",
        ctx_text,
        "\n```",
    ]
    if body.user_question and body.user_question.strip():
        user_parts.append("\nOfficer question:\n")
        user_parts.append(body.user_question.strip())
    else:
        user_parts.append(
            "\nNo specific question: give a short executive briefing and 3–5 priority actions."
        )
    user_content = "".join(user_parts)

    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_content},
        ],
        "temperature": 0.35,
        "max_tokens": 1200,
    }

    try:
        data = await asyncio.to_thread(_call_openai_chat, key, payload)
    except OpenAIRequestError as e:
        raise HTTPException(status_code=e.status_code, detail=e.detail) from e
    try:
        reply = data["choices"][0]["message"]["content"]
    except (KeyError, IndexError) as e:
        raise HTTPException(status_code=502, detail="Unexpected OpenAI response shape") from e

    return {"reply": reply.strip()}


# SPA last so /api/* and /api/docs stay on FastAPI
if _SERVE_SPA:
    from fastapi.staticfiles import StaticFiles

    app.mount("/", StaticFiles(directory=str(_ENV_DIR / "static"), html=True), name="spa")


if __name__ == "__main__":
    import uvicorn

    port = int(os.environ.get("AI_API_PORT", "8765"))
    print(f"Smart Estates AI API -> http://127.0.0.1:{port}")
    print("If you see 'address already in use', another copy is still running - close that terminal or change AI_API_PORT (and Vite proxy).")
    uvicorn.run(app, host="127.0.0.1", port=port)
