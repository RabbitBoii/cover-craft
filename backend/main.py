"""
Coverizer FastAPI Backend
- POST /generate       : Groq streaming (SSE) + Ollama embed + ChromaDB + SQLite
- POST /search         : Semantic search via ChromaDB + SQLite metadata join
- PATCH /applications/:id/status : Update application status & notes
"""

from __future__ import annotations
from contextlib import asynccontextmanager

import json
import os
import uuid
import logging
from datetime import datetime, timezone
from typing import AsyncGenerator, Literal, Optional


from google import genai
from google.genai import types
from pinecone import Pinecone
import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import create_engine, String, Integer, Text
from sqlalchemy.orm import DeclarativeBase, Session, Mapped, mapped_column

# ── Logging ───────────────────────────────────────────────────────────────────
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ── Config ────────────────────────────────────────────────────────────────────
load_dotenv()

GROQ_API_KEY: str = os.getenv("GROQ_API_KEY", "")
GROQ_MODEL: str = "llama-3.3-70b-versatile"
GROQ_BASE_URL: str = "https://api.groq.com/openai/v1"

GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")
PINECONE_API_KEY: str = os.getenv("PINECONE_KEY", "")
genai_client = genai.Client(api_key=GEMINI_API_KEY)
PINECONE_INDEX: str = "coverizer"    
DATABASE_URL: str = os.getenv("DATABASE_URL", "")



# ── Postgres ────────────────────────────────────────────────────────────────

engine = create_engine(DATABASE_URL, connect_args={"connect_timeout": 10})


class Base(DeclarativeBase):
    pass


# Use a plain str alias so Pylance doesn't complain about Literal as annotation
ApplicationStatus = Literal["generated", "applied", "interview", "offered", "rejected"]


class Application(Base):
    __tablename__ = "applications"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    job_title: Mapped[str] = mapped_column(String, nullable=False)
    company: Mapped[str] = mapped_column(String, nullable=False)
    mode: Mapped[str] = mapped_column(String, nullable=False)
    mode_label: Mapped[str] = mapped_column(String, nullable=False)
    text: Mapped[str] = mapped_column(Text, nullable=False)
    word_count: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(String, nullable=False, default="generated")
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(nullable=False, default=lambda: datetime.now(timezone.utc))


# create_all is called in the lifespan startup event below

GEMINI_EMBED_MODEL = "models/text-embedding-004"
pc = Pinecone(api_key=PINECONE_API_KEY)
index = pc.Index(PINECONE_INDEX)


# ── FastAPI ───────────────────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Run DB migrations on startup; gracefully warn if DB is unreachable."""
    try:
        Base.metadata.create_all(engine)
        logger.info("Database tables verified/created.")
    except Exception as exc:
        logger.warning("Could not connect to database at startup: %s", exc)
        logger.warning("Check DATABASE_URL in .env and ensure Supabase project is active.")
    yield


app = FastAPI(title="Coverizer API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "https://coverizer.vercel.app"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Pydantic models ───────────────────────────────────────────────────────────
class GenerateRequest(BaseModel):
    job_title: str
    company: str
    mode: str
    mode_label: str = ""
    jd: str = ""
    extra: str = ""
    context: str


class SearchRequest(BaseModel):
    query: str
    top_k: int = Field(default=10, ge=1, le=50)


class StatusPatch(BaseModel):
    status: str  # one of: generated | applied | interview | offered | rejected
    notes: Optional[str] = None


# Response shapes matching the TS ApplicationOut / SearchResultOut types
class ApplicationOut(BaseModel):
    id: str
    jobTitle: str
    company: str
    mode: str
    modeLabel: str
    text: str
    wordCount: int
    status: str
    notes: Optional[str]
    createdAt: str


class SearchResultOut(ApplicationOut):
    score: float


# ── Helpers ───────────────────────────────────────────────────────────────────
MODE_LABELS: dict[str, str] = {
    "cover_letter": "Cover Letter",
    "why_company": "Why This Company",
    "what_interests": "What Interests You",
    "strengths": "Strengths for Role",
}

VALID_STATUSES: set[str] = {"generated", "applied", "interview", "offered", "rejected"}

# Hard word ceilings per mode. Cover letters get more room; short-answer modes
# stay tight so they don't read like essays.
WORD_LIMITS: dict[str, int] = {
    "cover_letter": 250,
    "why_company": 150,
    "what_interests": 150,
    "strengths": 150,
}
DEFAULT_WORD_LIMIT = 200

# Words/phrases that scream "an AI wrote this" or generic filler. The model is
# instructed to avoid these and their close variants.
BANNED_WORDS: list[str] = [
    "passionate", "passion", "thrilled", "excited", "excitement", "enthusiastic",
    "enthusiasm", "delighted", "eager", "elated", "honored", "humbled",
    "delve", "leverage", "synergy", "tapestry", "realm", "landscape",
    "spearheaded", "pivotal", "robust", "seamless", "cutting-edge",
    "game-changer", "game-changing", "world-class", "best-in-class",
    "dynamic", "results-driven", "detail-oriented", "go-getter", "team player",
    "perfect fit", "perfect candidate", "hit the ground running",
    "wear many hats", "think outside the box", "value add", "deep dive",
]
BANNED_PHRASES: list[str] = [
    "I am writing to", "I am writing this letter to", "I would like to express",
    "It is with great", "I am reaching out", "Please find attached",
    "As you can see from my resume", "I believe I am the ideal",
    "I am confident that", "Thank you for considering my application",
    "Here is", "Here's", "Sure,", "Certainly,", "Of course,",
]


def _word_count(text: str) -> int:
    return len(text.strip().split())


def _record_to_out(record: Application) -> ApplicationOut:
    """Convert an ORM Application row to the Pydantic output model."""
    return ApplicationOut(
        id=record.id,
        jobTitle=record.job_title,
        company=record.company,
        mode=record.mode,
        modeLabel=record.mode_label or MODE_LABELS.get(record.mode, record.mode),
        text=record.text,
        wordCount=record.word_count,
        status=record.status,
        notes=record.notes,
        createdAt=record.created_at.isoformat(),
    )


def _get_embedding(text: str) -> list[float]:
    """Call Gemini text-embedding-004 via stable SDK and return the embedding vector."""
    try:
        result = genai_client.models.embed_content(
            model="gemini-embedding-2",
            contents=text,
            config=types.EmbedContentConfig(output_dimensionality=768)
        )
        if not result.embeddings:
            raise ValueError("Gemini returned no embeddings")
        values = result.embeddings[0].values
        if values is None:
            raise ValueError("Gemini embedding values are None")
        return list(values)
    except Exception as exc:
        logger.error("Gemini embedding error: %s", exc)
        raise HTTPException(status_code=502, detail=f"Embedding failed: {exc}")

def _persist(app_id: str, req: GenerateRequest, full_text: str) -> None:
    """Save metadata to SQLite and the embedding vector to ChromaDB."""
    wc = _word_count(full_text)
    mode_label = req.mode_label or MODE_LABELS.get(req.mode, req.mode)

    # 1. SQLite
    with Session(engine) as session:
        record = Application(
            id=app_id,
            job_title=req.job_title,
            company=req.company,
            mode=req.mode,
            mode_label=mode_label,
            text=full_text,
            word_count=wc,
            status="generated",
        )
        session.add(record)
        session.commit()

    # 2. Embed → Pinecone
    embedding = _get_embedding(full_text)
    index.upsert(vectors=[{
        "id": app_id,
        "values": embedding,
        "metadata": {"job_title": req.job_title, "company": req.company, "mode": req.mode}
}])
    logger.info("Persisted application %s", app_id)


# ── Routes ────────────────────────────────────────────────────────────────────

@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.post("/generate")
async def generate(req: GenerateRequest) -> StreamingResponse:
    """
    Stream Groq completion as SSE.
    After the stream ends, embed via Ollama and persist to SQLite + ChromaDB.

    SSE events:
      data: {"type": "chunk",  "text": "..."}
      data: {"type": "done",   "id": "<uuid>", "wordCount": N}
      data: {"type": "saved",  "id": "<uuid>"}
      data: {"type": "error",  "message": "..."}
    """
    if not GROQ_API_KEY:
        raise HTTPException(status_code=500, detail="GROQ_API_KEY not configured in backend/.env")

    app_id = str(uuid.uuid4())

    word_limit = WORD_LIMITS.get(req.mode, DEFAULT_WORD_LIMIT)
    banned_list = ", ".join(BANNED_WORDS)
    banned_phrase_list = "; ".join(f'"{p}"' for p in BANNED_PHRASES)

    system_prompt = (
        "You are a job application writer. Using the user's personal context below, "
        "write a response that sounds authentically like a real, specific person — "
        "not like an AI or a template.\n\n"
        f"USER CONTEXT:\n{req.context}\n\n"
        "HARD RULES (follow all):\n"
        f"- LENGTH: Stay under {word_limit} words. Be tight and concrete. "
        "No padding, no restating the question, no essay.\n"
        "- Output ONLY the final text. No preamble, no sign-off labels, no "
        "\"Here is...\", no markdown headers, no notes about what you did.\n"
        f"- BANNED WORDS — never use these or their variants: {banned_list}.\n"
        f"- BANNED OPENERS/PHRASES — never use: {banned_phrase_list}.\n"
        "- Do NOT fabricate. Use only facts, projects, and skills present in the "
        "user context. If something isn't in the context, don't claim it.\n"
        "- Be specific: name actual projects, tools, numbers, and outcomes from "
        "the context instead of abstract adjectives. Show, don't assert.\n"
        "- Plain, direct language. Short sentences. Active voice. Vary sentence "
        "length so it reads human, not robotic.\n"
        "- Match the tone and personality described in the context.\n"
        "- If a job description is provided, tailor tightly to its real "
        "requirements — mirror its priorities, not its buzzwords."
    )

    mode_prompts: dict[str, str] = {
        "cover_letter": "Write a tailored cover letter",
        "why_company": "Answer 'Why do you want to work here?' with specific, concrete reasons",
        "what_interests": "Answer 'What interests you about this role?' with specifics tied to the user's real experience",
        "strengths": "Answer 'What are your key strengths for this role?' with evidence, concisely",
    }
    mode_instruction = mode_prompts.get(req.mode, req.mode_label or req.mode)
    user_msg = (
        f'{mode_instruction} for the role of "{req.job_title}" at "{req.company}". '
        f"Keep it under {word_limit} words."
    )
    if req.jd.strip():
        user_msg += f"\n\nJob description:\n{req.jd}"
    if req.extra.strip():
        user_msg += f"\n\nAdditional instructions: {req.extra}"

    async def event_stream() -> AsyncGenerator[str, None]:
        full_text = ""
        try:
            async with httpx.AsyncClient(timeout=120) as client:
                async with client.stream(
                    "POST",
                    f"{GROQ_BASE_URL}/chat/completions",
                    headers={
                        "Authorization": f"Bearer {GROQ_API_KEY}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "model": GROQ_MODEL,
                        "messages": [
                            {"role": "system", "content": system_prompt},
                            {"role": "user", "content": user_msg},
                        ],
                        "stream": True,
                        "temperature": 0.7,
                        "max_tokens": 2048,
                    },
                ) as response:
                    if response.status_code != 200:
                        body = await response.aread()
                        msg = f"Groq API error {response.status_code}: {body.decode()}"
                        logger.error(msg)
                        yield f"data: {json.dumps({'type': 'error', 'message': msg})}\n\n"
                        return

                    async for line in response.aiter_lines():
                        if not line.startswith("data: "):
                            continue
                        raw = line[6:]  # strip "data: "
                        if raw.strip() == "[DONE]":
                            break
                        try:
                            payload: dict = json.loads(raw)
                            delta: str = payload["choices"][0]["delta"].get("content", "")
                            if delta:
                                full_text += delta
                                yield f"data: {json.dumps({'type': 'chunk', 'text': delta})}\n\n"
                        except (json.JSONDecodeError, KeyError, IndexError):
                            continue

            # Generation complete
            wc = _word_count(full_text)
            yield f"data: {json.dumps({'type': 'done', 'id': app_id, 'wordCount': wc})}\n\n"

            # Persist
            try:
                _persist(app_id, req, full_text)
                yield f"data: {json.dumps({'type': 'saved', 'id': app_id})}\n\n"
            except Exception as save_err:
                logger.error("Persist error: %s", save_err)
                yield f"data: {json.dumps({'type': 'error', 'message': f'Save failed: {save_err}'})}\n\n"

        except Exception as exc:
            logger.error("Stream error: %s", exc)
            yield f"data: {json.dumps({'type': 'error', 'message': str(exc)})}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@app.post("/search", response_model=list[SearchResultOut])
def search(req: SearchRequest) -> list[SearchResultOut]:
    """
    Embed query via Ollama → cosine search in ChromaDB → join metadata from SQLite.
    """
    query_embedding = _get_embedding(req.query)

    raw = index.query(
    vector=query_embedding,
        top_k=req.top_k,
        include_metadata=True
    )

    matches = raw.get("matches", [])
    if not matches:
        return []

    id_list = [match['id'] for match in matches]
    dist_list = [match['score'] for match in matches]


    if not id_list:
        return []

    with Session(engine) as session:
        records = session.query(Application).filter(Application.id.in_(id_list)).all()

    record_map: dict[str, Application] = {r.id: r for r in records}
    out: list[SearchResultOut] = []

    for rid, dist in zip(id_list, dist_list):
        record = record_map.get(rid)
        if record is None:
            continue
        score = round(float(dist), 4)  # cosine distance → similarity
        out.append(
            SearchResultOut(
                **_record_to_out(record).model_dump(),
                score=score,
            )
        )

    out.sort(key=lambda x: x.score, reverse=True)
    return out


@app.patch("/applications/{app_id}/status", response_model=ApplicationOut)
def update_status(app_id: str, patch: StatusPatch) -> ApplicationOut:
    """
    Update application status and/or notes in SQLite.
    Valid statuses: generated → applied → interview → offered → rejected
    """
    if patch.status not in VALID_STATUSES:
        raise HTTPException(
            status_code=422,
            detail=f"Invalid status '{patch.status}'. Must be one of: {sorted(VALID_STATUSES)}",
        )

    with Session(engine) as session:
        record = session.query(Application).filter(Application.id == app_id).first()
        if record is None:
            raise HTTPException(status_code=404, detail=f"Application '{app_id}' not found")

        record.status = patch.status
        if patch.notes is not None:
            record.notes = patch.notes

        session.commit()
        session.refresh(record)
        return _record_to_out(record)


@app.get("/applications", response_model=list[ApplicationOut])
def list_applications() -> list[ApplicationOut]:
    """Return all applications, newest first."""
    with Session(engine) as session:
        records = session.query(Application).order_by(Application.created_at.desc()).all()
        return [_record_to_out(r) for r in records]


@app.delete("/applications/{app_id}", status_code=204)
def delete_application(app_id: str) -> None:
    """Delete an application from SQLite and ChromaDB."""
    with Session(engine) as session:
        record = session.query(Application).filter(Application.id == app_id).first()
        if record is None:
            raise HTTPException(status_code=404, detail=f"Application '{app_id}' not found")
        session.delete(record)
        session.commit()

    try:
        index.delete(ids=[app_id])
    except Exception as exc:
        logger.warning("ChromaDB delete warning for %s: %s", app_id, exc)
