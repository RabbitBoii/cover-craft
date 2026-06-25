"""
One-off backfill: assign every pre-isolation row (user_id IS NULL) to a single
owner so your existing generations stay visible after per-browser isolation.

Usage (from backend/, with the venv active and .env populated):

    python backfill_user_id.py <user_id>

Where <user_id> is the value your browser stored in localStorage under
`cc_user_id` (DevTools → Application → Local Storage → cc_user_id).

It updates BOTH:
  - the Postgres `applications` rows (user_id column), and
  - the matching Pinecone vector metadata (so semantic search finds them).

Safe to re-run: only rows that are still NULL get touched.
"""

from __future__ import annotations

import os
import sys

from dotenv import load_dotenv
from pinecone import Pinecone
from sqlalchemy import create_engine, text

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "")
PINECONE_API_KEY = os.getenv("PINECONE_KEY", "")
PINECONE_INDEX = "coverizer"


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

    # 2. Mirror the owner onto the Pinecone vector metadata so search filters work.
    if not PINECONE_API_KEY:
        print("PINECONE_KEY not set — skipped Pinecone metadata backfill.")
        return

    pc = Pinecone(api_key=PINECONE_API_KEY)
    index = pc.Index(PINECONE_INDEX)

    updated = 0
    for vec_id in null_ids:
        try:
            index.update(id=vec_id, set_metadata={"user_id": user_id})
            updated += 1
        except Exception as exc:  # noqa: BLE001 - best-effort, keep going
            print(f"  ! Pinecone update failed for {vec_id}: {exc}")

    print(f"Pinecone: updated metadata on {updated}/{len(null_ids)} vector(s).")
    print("Done.")


if __name__ == "__main__":
    main()
