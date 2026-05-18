# CoverCraft

AI-powered cover letter and job application answer generator. Paste your context once, generate tailored outputs for any role, and track every application with semantic search over your history.

Built for personal use — fully local embeddings, free LLM, no SaaS, no subscription.

---

## Stack

| Layer | Tech |
|---|---|
| Frontend | React 18, TypeScript, Tailwind CSS, Vite |
| LLM | Groq API — llama-3.3-70b-versatile (free tier) |
| Embeddings | Ollama — nomic-embed-text (local) |
| Vector store | ChromaDB (local, persisted to disk) |
| Database | SQLite via SQLAlchemy |
| Backend | FastAPI |

---

## Project structure

```
coverizer/
├── backend/
│   ├── main.py              # FastAPI app — all routes
│   ├── requirements.txt
│   ├── coverizer.db         # SQLite (auto-created)
│   ├── chroma_store/        # ChromaDB vectors (auto-created)
│   ├── .env                 # GROQ_API_KEY goes here
│   └── .env.example
├── src/
│   ├── lib/
│   │   ├── ollama.ts        # Ollama chat + embed client
│   │   └── storage.ts       # History persistence helpers
│   ├── types.ts             # Shared TypeScript types
│   ├── App.tsx
│   └── context.txt          # Your personal context file
├── index.html
├── vite.config.ts
└── package.json
```

---

## Prerequisites

- [Node.js](https://nodejs.org) 18+
- [Python](https://python.org) 3.10+
- [Ollama](https://ollama.ai) installed and running

Pull the embedding model:

```bash
ollama pull nomic-embed-text
```

Get a free Groq API key at [console.groq.com](https://console.groq.com)

---

## Setup

### 1. Frontend

```bash
npm install
```

### 2. Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

Create your `.env` file:

```bash
cp .env.example .env
```

Add your key to `.env`:

```
GROQ_API_KEY=gsk_your_key_here
```

---

## Running

You need three things running simultaneously:

```bash
# Terminal 1 — Ollama
ollama serve

# Terminal 2 — FastAPI backend
cd backend
source venv/bin/activate
uvicorn main:app --reload --port 8000

# Terminal 3 — Frontend
npm run dev
```

Open [localhost:5173](http://localhost:5173)

---

## How it works

### Generation
1. You fill in job title, company, mode, and optionally paste the JD
2. Frontend hits `POST /generate` on the FastAPI backend
3. Backend calls Groq (llama-3.3-70b) and streams the response back via SSE
4. Once generation completes, backend embeds the output via Ollama locally
5. Vector saved to ChromaDB, metadata saved to SQLite — both keyed by the same UUID
6. Frontend shows the "Embedded & saved to History" confirmation

### Semantic search
1. You type a query in the History tab ("that fintech cover letter from last month")
2. Frontend hits `POST /search`
3. Backend embeds the query via Ollama, queries ChromaDB by cosine similarity
4. Matched IDs are looked up in SQLite to return full application records
5. Results ranked by similarity score

### Application tracking
- Every generated cover letter starts with status `generated`
- Update to `applied → interview → offered / rejected` from the History tab
- Add notes per application (interview date, feedback, contacts)

---

## Modes

| Mode | What it generates |
|---|---|
| Cover Letter | Full tailored cover letter |
| Why This Company | Answer to "why do you want to work here" |
| What Interests You | Answer to "what interests you about this role" |
| Strengths for Role | Answer to "what are your key strengths here" |

---

## Context file

`src/context.txt` is your personal system prompt — the AI always responds through this lens. Edit it whenever your situation changes (new projects, new role targets, etc.).

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

The more specific and honest this file is, the better every output gets.

---

## Roadmap

- [ ] Tighter system prompt — hardcoded word limit + cliché ban list
- [ ] Semantic search UI in History tab
- [ ] Application status kanban view
- [ ] Export history to CSV
- [ ] Context chunking — embed context sections and retrieve only what's relevant per JD