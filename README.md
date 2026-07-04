# CoverCraft

AI-powered cover letter and job-application answer generator. Paste your context once, generate tailored outputs for any role, and track every application with semantic search over your history.

**Live app → [coverizer.vercel.app](https://coverizer.vercel.app)**

---

## Showcase

| Landing page | Context | Output |
|---|---|---|
| ![Landing page](public/ss2.png) | ![Output tab](public/ss3.png) | ![Context tab](public/ss.png) |

---

## Stack

| Layer | Tech |
|---|---|
| Frontend | React 19, TypeScript, Tailwind CSS v4, Vite 8 — deployed on **Vercel** |
| Backend | FastAPI (single-file `backend/main.py`) — deployed on **Render** |
| LLM | Groq API — `openai/gpt-oss-120b` (`reasoning_effort: low`), streamed over SSE |
| Embeddings | Google Gemini — 768-dim vectors |
| Database + vector store | Postgres with **pgvector** via SQLAlchemy (Supabase in deployment) — row and embedding live in the same table |
| Rate limiting | slowapi — keyed by client IP |

> **Note:** earlier versions ran fully local (Ollama embeddings + ChromaDB + SQLite), then briefly used Pinecone as a separate vector store. Both paths have been replaced: vectors now live in a pgvector column next to the row itself. Leftover `backend/coverizer.db`, `chroma_store/`, `src/lib/ollama.ts`, and `src/lib/storage.ts` are legacy and unused.

---

## Project structure

```
coverizer/
├── backend/
│   ├── main.py              # FastAPI app — all routes, single file
│   ├── requirements.txt
│   ├── Procfile             # uvicorn entrypoint for Render
│   ├── .env                 # API keys + DATABASE_URL (not committed)
│   ├── backfill_embeddings.py  # one-off: re-embed rows missing a vector (pgvector migration)
│   └── test_pipeline.py     # live end-to-end smoke test (needs a running server)
├── src/
│   ├── lib/
│   │   └── api.ts           # the only client → backend bridge
│   ├── App.tsx              # single component, four tabs (Context/Generate/Output/History)
│   ├── types.ts
│   └── index.css            # Tailwind v4 theme
├── public/
├── index.html
├── vite.config.ts
└── package.json
```

---

## Prerequisites

- [Node.js](https://nodejs.org) 18+
- [Python](https://python.org) 3.10+
- API keys / connection strings for:
  - **Groq** — free tier at [console.groq.com](https://console.groq.com)
  - **Google Gemini** — [aistudio.google.com](https://aistudio.google.com)
  - **Postgres with pgvector** — any Postgres URL where the `vector` extension is available (e.g. a free [Supabase](https://supabase.com) project; the backend runs `CREATE EXTENSION IF NOT EXISTS vector` on startup)

---

## Setup

### 1. Frontend

```bash
npm install
```

Optionally point the frontend at a non-default backend by creating `.env`:

```
VITE_API_URL=http://localhost:8000   # default if unset
```

### 2. Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate   # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

Create `backend/.env`:

```
GROQ_API_KEY=gsk_your_key_here
GEMINI_API_KEY=your_gemini_key
DATABASE_URL=postgresql://user:pass@host:5432/dbname
```

---

## Running

```bash
# Terminal 1 — FastAPI backend
cd backend
source venv/bin/activate
uvicorn main:app --reload --port 8000

# Terminal 2 — Frontend
npm run dev
```

Open [localhost:5173](http://localhost:5173).

To run the integration smoke test (hits a **running** server on `:8000` — it's not pytest):

```bash
cd backend
python test_pipeline.py
```

---

## How it works

### Generation
1. You fill in job title, company, mode, and optionally paste the JD / extra instructions.
2. Frontend hits `POST /generate`.
3. Backend calls Groq (`openai/gpt-oss-120b`, a reasoning model run at `reasoning_effort: low` so first token arrives fast; reasoning tokens stay out of the SSE stream) and streams the response back via **SSE** (event types `chunk` / `done` / `saved` / `error`).
4. Once the stream finishes, the output is embedded with Gemini and the row — text, metadata, **and** the 768-dim vector — is written to **Postgres** in a single transaction. Embedding happens *before* the insert, so a row can never exist without its vector (and a vector can never outlive its row).
5. Frontend shows the "Embedded & saved to History" confirmation.

### Semantic search
1. You type a query in the History tab ("that fintech cover letter from last month").
2. Frontend hits `POST /search`.
3. Backend embeds the query with Gemini and runs a single pgvector cosine-distance query (`ORDER BY embedding <=> query LIMIT k`, scoped to your user id) — no separate vector store, no cross-store ID join. An HNSW index keeps it fast as history grows.

### Application tracking
- Every generated cover starts with status `generated`.
- Update it through the pipeline from the History tab: `applied → interview → offered / rejected`.

---

## Modes

| Mode | What it generates |
|---|---|
| Cover Letter | Full tailored cover letter |
| Why This Company | Answer to "why do you want to work here" |
| What Interests You | Answer to "what interests you about this role" |
| Strengths for Role | Answer to "what are your key strengths here" |

> Adding or renaming a mode requires keeping three places in sync: `MODES` in `src/App.tsx`, and `MODE_LABELS` + `mode_prompts` in `backend/main.py`.

---

## Context

Your personal context is the system prompt — the AI always responds through this lens. Upload it as a `.txt` file (or paste it) in the **Context** tab; it's kept in the browser's `localStorage`, not on disk. The in-app guide includes a ready-made prompt you can feed to any LLM to generate it.

Suggested structure:

```
Name: ...
Role target: ...
Background: ...
Key projects: ...
Tone: ...
Strengths: ...
What I want: ...
What I don't want: ...
```

The more specific and honest this is, the better every output gets.

---

## Deployment notes

- **Frontend** → Vercel. Set `VITE_API_URL` to the backend's public URL.
- **Backend** → Render via `backend/Procfile` (`uvicorn main:app --host 0.0.0.0 --port $PORT`). Set `GROQ_API_KEY`, `GEMINI_API_KEY`, and `DATABASE_URL` as environment variables.
- CORS `allow_origins` in `main.py` is an explicit allowlist (`localhost:5173` + the deployed Vercel URL) — add any new frontend origin there.
- **Migrating from a pre-pgvector deployment:** startup auto-adds the `embedding` column, but rows generated while Pinecone was the vector store will have it NULL and won't appear in search until you run `python backfill_embeddings.py` (re-embeds them from the text already in Postgres). Once that's done, the Pinecone index and `PINECONE_KEY` env var can be deleted.

---

## Roadmap

- [x] Tighter system prompt — hardcoded word limits + cliché/buzzword ban list
- [x] Semantic search UI in History tab
- [x] Application status tracking
- [x] Mobile-responsive layout
- [ ] Application status kanban view
- [ ] Export history to CSV
- [ ] Context chunking — embed context sections and retrieve only what's relevant per JD
