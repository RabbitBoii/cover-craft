# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Coverizer (README calls it "CoverCraft") generates tailored cover letters and job-application answers from a personal context blob, then persists each generation (text + pgvector embedding, same Postgres row) so it can be semantically searched and tracked through an application pipeline (`generated → applied → interview → offered → rejected`).

It is a two-part app: a Vite/React frontend (`src/`) and a FastAPI backend (`backend/`).

## Commands

Frontend (run from repo root):
```bash
npm install
npm run dev        # Vite dev server on :5173
npm run build      # type-check + production build
npm run lint       # eslint
npm run preview
```

Backend (run from `backend/`):
```bash
python -m venv venv && source venv/bin/activate   # Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
python test_pipeline.py    # integration smoke test — hits a RUNNING server on :8000 (not pytest)
```
`test_pipeline.py` is a live end-to-end check, not a unit test. Start the backend first; it exercises `POST /generate` (SSE) then `GET /applications`.

## Architecture

Request flow for a generation (`backend/main.py` — the entire backend is one file):
1. Frontend `POST /generate` with job title, company, mode, optional JD/extra, and the user's `context` string.
2. Backend streams a Groq completion (`openai/gpt-oss-120b`, `reasoning_effort: low`) back as **SSE** — event types `chunk` / `done` / `saved` / `error`. gpt-oss returns its reasoning in a separate `delta.reasoning` field, which the parser ignores by design (it only reads `delta.content`).
3. After the stream finishes, `_persist()` (run via `asyncio.to_thread` so its sync I/O doesn't block the event loop) embeds the text and writes one **Postgres** row containing text, metadata, and the 768-dim vector (pgvector column on the SQLAlchemy `Application` model). Embed-before-insert means a row can never exist without its vector.
4. Embeddings come from **Gemini** (`gemini-embedding-2`, `output_dimensionality=768`) via `_get_embedding()`.

Semantic search (`POST /search`): embed the query with Gemini → single pgvector cosine-distance query in Postgres (filtered by `user_id`, `embedding IS NOT NULL`, ordered by distance, HNSW-indexed) → `score = 1 - distance`. There is no separate vector store.

Startup (`lifespan`) runs idempotent migrations: `CREATE EXTENSION vector`, `create_all`, `ALTER TABLE ... ADD COLUMN` for `user_id`/`embedding`, and the HNSW index. `backfill_embeddings.py` re-embeds rows whose `embedding` is NULL (pre-pgvector rows).

The frontend talks to the backend only through `src/lib/api.ts` (`generateStream`, `searchApplications`, `listApplications`, `updateApplicationStatus`, `deleteApplication`). `src/App.tsx` is a single ~650-line component with four tabs (Context / Generate / Output / History). The user's personal context is uploaded as a `.txt` file in the UI and kept in `localStorage` (`cc_context`) — it is NOT read from a file on disk by the running app.

### Stale code / migration state — read before editing
The README and several files describe **older architectures** (local-only Ollama/ChromaDB/SQLite, then Pinecone as a separate vector store) that have been replaced. The live code path uses Groq + Gemini + Postgres/pgvector. The following are **legacy and unused** — do not wire new work through them:
- `src/lib/ollama.ts` — old local Ollama chat/embed client. Not imported by `App.tsx`.
- `src/lib/storage.ts` — old localStorage-based cover persistence + in-browser cosine search.
- `src/types.ts` `SavedCover` / `SearchResult` (with an `embedding: number[]` field) — superseded by `ApplicationOut` / `SearchResultOut` defined in `src/lib/api.ts`.
- `backend/coverizer.db`, `backend/chroma_store/`, `backend/chroma_test/` — leftover SQLite + ChromaDB artifacts from before the Postgres migration.

When touching backend storage or frontend types, prefer the api.ts / Postgres+pgvector path and treat any remaining "fully local / Ollama / ChromaDB / SQLite / Pinecone" references as outdated.

## Environment variables

Backend (`backend/.env`):
- `GROQ_API_KEY` — required for `/generate`.
- `GEMINI_API_KEY` — required for embeddings.
- `DATABASE_URL` — Postgres connection string (Supabase in deployment); the `vector` extension must be available (startup runs `CREATE EXTENSION IF NOT EXISTS vector`).

Frontend: `VITE_API_URL` selects the backend base URL; falls back to `http://localhost:8000`.

## Deployment notes
- Backend deploys via `backend/Procfile` (`uvicorn main:app --host 0.0.0.0 --port $PORT`).
- CORS `allow_origins` in `main.py` is an explicit allowlist (`localhost:5173` + `https://coverizer.vercel.app`) — add new frontend origins there.
- Adding/renaming a mode requires keeping three places in sync: `MODES` in `src/App.tsx`, and `MODE_LABELS` + `mode_prompts` in `backend/main.py`.
