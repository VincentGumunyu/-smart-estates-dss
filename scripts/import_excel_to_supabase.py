"""Import Excel data into Supabase 'tuckshops' table.

Usage:
  pip install -r requirements-data.txt
  set SUPABASE_URL=https://YOUR_PROJECT.supabase.co
  set SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY
  python scripts/import_excel_to_supabase.py
"""

from __future__ import annotations

import os
import hashlib
from pathlib import Path

import pandas as pd
from supabase import create_client

ROOT = Path(__file__).resolve().parents[1]
MONTHLY_RENT = 57.50


def load_root_env() -> None:
    """Load KEY=value pairs from repo root .env (if present)."""
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


def to_money(v):
    if v is None:
        return None
    s = str(v).strip()
    if not s:
        return None
    n = "".join(ch for ch in s if ch.isdigit() or ch in ".-")
    if not n:
        return None
    try:
        return round(float(n), 2)
    except ValueError:
        return None


def to_int(v):
    try:
        if pd.isna(v):
            return None
    except TypeError:
        pass
    s = str(v).strip()
    if not s:
        return None
    try:
        return int(float(s))
    except ValueError:
        return None


def to_date(v):
    try:
        if pd.isna(v):
            return None
    except TypeError:
        pass
    if hasattr(v, "strftime"):
        return v.strftime("%Y-%m-%d")
    s = str(v).strip()
    if not s:
        return None
    # Handle common day-first formats from source spreadsheets, e.g. 27/09/1995
    dt = pd.to_datetime(s, errors="coerce", dayfirst=True)
    if pd.notna(dt):
        return dt.strftime("%Y-%m-%d")
    return None


def resolve_excel_file() -> Path:
    # Optional explicit override
    explicit = os.environ.get("EXCEL_PATH", "").strip()
    if explicit:
        p = Path(explicit)
        if not p.is_absolute():
            p = ROOT / p
        if p.exists():
            return p
        raise SystemExit(f"EXCEL_PATH not found: {p}")

    # Preferred known names
    preferred = [
        ROOT / "LIST OF LEGAL TUCKSHOPS GWERU CITY WIDE (1).xlsx",
        ROOT / "legal_tuckshop_registry_full.xlsx",
    ]
    for p in preferred:
        if p.exists():
            return p

    # Fallback: choose an .xlsx that likely contains the registry
    candidates = sorted(ROOT.glob("*.xlsx"))
    ranked = [p for p in candidates if "tuckshop" in p.name.lower() or "legal" in p.name.lower()]
    if ranked:
        return ranked[0]
    if candidates:
        return candidates[0]
    raise SystemExit(f"No .xlsx files found in {ROOT}")


def resolve_book2_file() -> Path | None:
    explicit = os.environ.get("BOOK2_PATH", "").strip()
    if explicit:
        p = Path(explicit)
        if not p.is_absolute():
            p = ROOT / p
        if p.exists():
            return p
        raise SystemExit(f"BOOK2_PATH not found: {p}")

    candidates = [ROOT / "Book2.xlsx", ROOT / "book2.xlsx"]
    for p in candidates:
        if p.exists():
            return p
    return None


def clean_text(v):
    if v is None:
        return None
    s = str(v).strip()
    return s or None


def normalize_name(v):
    s = clean_text(v)
    if not s:
        return None
    # Normalize whitespace/case so matching is robust across sheets
    return " ".join(s.upper().split())


def row_hash(parts: list[str | None]) -> str:
    data = "|".join("" if p is None else str(p) for p in parts)
    return hashlib.sha1(data.encode("utf-8")).hexdigest()


def main():
    load_root_env()
    url = os.environ.get("SUPABASE_URL", "").strip()
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    if not url or not key:
        raise SystemExit(
            "Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in terminal, or add them to root .env."
        )

    # Parse Book2 first so we can merge/enrich the main registry by lessee name.
    book2 = resolve_book2_file()
    book2_rows = []
    book2_by_name = {}
    if book2:
        print(f"Using Book2 file: {book2.name}")
        df2 = pd.read_excel(book2).fillna("")
        for _, r in df2.iterrows():
            name = clean_text(r.get("LEGAL TUCKSHOPS GWERU CITY WIDE "))
            kiosk = to_int(r.get("Unnamed: 1"))
            signed = to_date(r.get("Unnamed: 2"))
            location = clean_text(r.get("Unnamed: 3"))
            op = clean_text(r.get("Unnamed: 4"))
            lease = clean_text(r.get("Unnamed: 5"))
            c6 = clean_text(r.get("Unnamed: 6"))
            c7 = clean_text(r.get("Unnamed: 7"))
            c8 = clean_text(r.get("Unnamed: 8"))
            if not any([name, kiosk, signed, location, op, lease, c6, c7, c8]):
                continue
            h = row_hash([name, str(kiosk) if kiosk is not None else None, signed, location, op, lease, c6, c7, c8])
            rec = {
                "lessee_name": name,
                "kiosk_number": kiosk,
                "date_signed": signed,
                "location": location,
                "operational_status": op,
                "lease_status": lease,
                "col6": c6,
                "col7": c7,
                "col8": c8,
                "source_row_hash": h,
            }
            book2_rows.append(rec)

            nkey = normalize_name(name)
            if not nkey:
                continue
            prev = book2_by_name.get(nkey)
            if prev is None:
                book2_by_name[nkey] = rec
            else:
                # Prefer the row with a date_signed; if both have date, keep latest.
                prev_d = prev.get("date_signed")
                cur_d = rec.get("date_signed")
                if prev_d and cur_d:
                    if cur_d > prev_d:
                        book2_by_name[nkey] = rec
                elif cur_d and not prev_d:
                    book2_by_name[nkey] = rec
                elif not cur_d and not prev_d:
                    # fallback: keep the one with more filled fields
                    prev_score = sum(1 for k in ("kiosk_number", "location", "operational_status", "lease_status", "col6", "col7", "col8") if prev.get(k))
                    cur_score = sum(1 for k in ("kiosk_number", "location", "operational_status", "lease_status", "col6", "col7", "col8") if rec.get(k))
                    if cur_score > prev_score:
                        book2_by_name[nkey] = rec

    # Deduplicate Book2 rows by source hash for upsert safety
    # (same constrained key cannot appear twice in one ON CONFLICT command)
    dedup_book2 = {}
    for rec in book2_rows:
        dedup_book2[rec["source_row_hash"]] = rec
    book2_rows = list(dedup_book2.values())

    excel = resolve_excel_file()
    print(f"Using Excel file: {excel.name}")

    df = pd.read_excel(excel).fillna("")
    rows = []
    for _, r in df.iterrows():
        lessee_name = clean_text(r.get("NAME OF LESSEEE", ""))
        row = {
            "kiosk_number": to_int(r.get("KIOSK NUMBER ")),
            "lessee_name": lessee_name,
            "date_signed": to_date(r.get(" DATE SIGNED ")),
            "location": clean_text(r.get("LOCATION", "")),
            "operational_status": clean_text(r.get("OPERATIONAL STATUS", "")),
            "lease_status": clean_text(r.get("LEASE STATUS", "")),
            "monthly_rental_usd": MONTHLY_RENT,
            "arrears_usd": to_money(r.get("Arrears")),
            "account_number": clean_text(r.get("Account Number", "")),
            "comments": clean_text(r.get("Comments", "")),
            "kiosk_id": clean_text(r.get("kiosk_id", "")),
            "tenant_name": clean_text(r.get("tenant_name", "")),
            "payment_date": to_date(r.get("payment_date")),
            "amount_paid": to_money(r.get("amount_paid")),
        }

        # Merge Book2 details by NAME OF LESSEEE (normalized).
        b2 = book2_by_name.get(normalize_name(lessee_name))
        if b2:
            if row["kiosk_number"] is None and b2.get("kiosk_number") is not None:
                row["kiosk_number"] = b2["kiosk_number"]
            if not row["date_signed"] and b2.get("date_signed"):
                row["date_signed"] = b2["date_signed"]
            if not row["location"] and b2.get("location"):
                row["location"] = b2["location"]
            # Operational / lease from Book2 are often fresher status notes; prefer non-empty Book2.
            if b2.get("operational_status"):
                row["operational_status"] = b2["operational_status"]
            if b2.get("lease_status"):
                row["lease_status"] = b2["lease_status"]
            extra_notes = " | ".join([x for x in [b2.get("col6"), b2.get("col7"), b2.get("col8")] if x])
            if extra_notes:
                row["comments"] = f"{row['comments']} | Book2: {extra_notes}".strip(" |")

        rows.append(row)

    # Keep only meaningful records
    rows = [x for x in rows if x["lessee_name"]]

    # Deduplicate by kiosk_number for upsert safety:
    # ON CONFLICT ... DO UPDATE fails if the same constrained value appears
    # multiple times in a single insert command.
    deduped = {}
    no_kiosk = []
    for r in rows:
        k = r.get("kiosk_number")
        if k is None:
            no_kiosk.append(r)
            continue
        # Keep the latest encountered row for each kiosk_number
        deduped[k] = r
    rows = list(deduped.values()) + no_kiosk

    client = create_client(url, key)

    # Upsert on kiosk_number to avoid duplicates if re-importing
    chunk = 500
    for i in range(0, len(rows), chunk):
        client.table("tuckshops").upsert(rows[i : i + chunk], on_conflict="kiosk_number").execute()

    print(f"Imported {len(rows)} rows into public.tuckshops")

    # Import Book2.xlsx (if present) into separate table
    if not book2:
        print("Book2.xlsx not found; skipped secondary import.")
        return

    chunk = 500
    for i in range(0, len(book2_rows), chunk):
        client.table("tuckshops_book2").upsert(
            book2_rows[i : i + chunk],
            on_conflict="source_row_hash",
        ).execute()
    print(f"Imported {len(book2_rows)} rows into public.tuckshops_book2")


if __name__ == "__main__":
    main()
