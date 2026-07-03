"""
One-off backfill for the Pinecone → pgvector migration: rows generated before
the migration have their text in Postgres but a NULL `embedding` column, so
semantic search can't see them. This re-embeds each such row with Gemini and
writes the vector in place. (Re-embedding is simpler than exporting vectors
from Pinecone, and the source text is already local.)

Usage (from backend/, with the venv active and .env populated):

    python backfill_embeddings.py

Safe to re-run: only rows where embedding IS NULL get touched.
"""

from __future__ import annotations

import os

from dotenv import load_dotenv
from google import genai
from google.genai import types
from sqlalchemy import create_engine, text

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")


def main() -> None:
    if not DATABASE_URL or not GEMINI_API_KEY:
        print("DATABASE_URL and GEMINI_API_KEY must be set in the environment / .env")
        raise SystemExit(1)

    client = genai.Client(api_key=GEMINI_API_KEY)
    engine = create_engine(DATABASE_URL, pool_pre_ping=True, connect_args={"connect_timeout": 10})

    with engine.connect() as conn:
        rows = conn.execute(
            text("SELECT id, text FROM applications WHERE embedding IS NULL")
        ).fetchall()

    if not rows:
        print("No rows with a NULL embedding — nothing to backfill.")
        return

    print(f"Embedding {len(rows)} row(s)...")
    done = 0
    for row_id, body in rows:
        try:
            result = client.models.embed_content(
                model="gemini-embedding-2",
                contents=body,
                config=types.EmbedContentConfig(output_dimensionality=768),
            )
            values = result.embeddings[0].values if result.embeddings else None
            if not values:
                print(f"  ! Gemini returned no embedding for {row_id}, skipped")
                continue
            # One row per transaction so a mid-run failure keeps prior progress.
            with engine.begin() as conn:
                conn.execute(
                    text("UPDATE applications SET embedding = :emb WHERE id = :id"),
                    {"emb": str(list(values)), "id": row_id},
                )
            done += 1
        except Exception as exc:  # noqa: BLE001 - best-effort, keep going
            print(f"  ! Failed for {row_id}: {exc}")

    print(f"Backfilled {done}/{len(rows)} row(s). Re-run to retry any failures.")


if __name__ == "__main__":
    main()
