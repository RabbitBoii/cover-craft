"""
One-off backfill: assign every pre-isolation row (user_id IS NULL) to a single
owner so your existing generations stay visible after per-browser isolation.

Usage (from backend/, with the venv active and .env populated):

    python backfill_user_id.py <user_id>

Where <user_id> is the value your browser stored in localStorage under
`cc_user_id` (DevTools → Application → Local Storage → cc_user_id).

Row and vector now live in the same Postgres table (pgvector), so updating the
user_id column is all that's needed — search filters pick it up immediately.

Safe to re-run: only rows that are still NULL get touched.
"""

from __future__ import annotations

import os
import sys

from dotenv import load_dotenv
from sqlalchemy import create_engine, text

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "")


def main() -> None:
    if len(sys.argv) != 2 or not sys.argv[1].strip():
        print("Usage: python backfill_user_id.py <user_id>")
        sys.exit(1)

    user_id = sys.argv[1].strip()
    if not DATABASE_URL:
        print("DATABASE_URL is not set in the environment / .env")
        sys.exit(1)

    engine = create_engine(DATABASE_URL, connect_args={"connect_timeout": 10})

    # 1. Collect the IDs that still need an owner, then claim them in Postgres.
    with engine.begin() as conn:
        rows = conn.execute(
            text("SELECT id FROM applications WHERE user_id IS NULL")
        ).fetchall()
        null_ids = [r[0] for r in rows]

        if not null_ids:
            print("No rows with a NULL user_id — nothing to backfill.")
            return

        conn.execute(
            text("UPDATE applications SET user_id = :uid WHERE user_id IS NULL"),
            {"uid": user_id},
        )

    print(f"Postgres: assigned {len(null_ids)} row(s) to user_id={user_id}")
    print("Done.")


if __name__ == "__main__":
    main()
