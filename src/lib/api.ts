/**
 * coverizer/src/lib/api.ts
 * 
 * Thin client for the FastAPI backend at http://localhost:8000
 * Mirrors the TS types in ../types.ts
 */

const BASE = 'http://localhost:8000';

// ── Types (extend / replace old localStorage shapes) ──────────────────────────

export type ApplicationStatus =
  | 'generated'
  | 'applied'
  | 'interview'
  | 'offered'
  | 'rejected';

export interface ApplicationOut {
  id: string;
  jobTitle: string;
  company: string;
  mode: string;
  modeLabel: string;
  text: string;
  wordCount: number;
  status: ApplicationStatus;
  notes: string | null;
  createdAt: string;
}

export interface SearchResultOut extends ApplicationOut {
  score: number;
}

// ── SSE event payloads from POST /generate ────────────────────────────────────

export type GenerateEvent =
  | { type: 'chunk'; text: string }
  | { type: 'done'; id: string; wordCount: number }
  | { type: 'saved'; id: string }
  | { type: 'error'; message: string };

// ── API helpers ───────────────────────────────────────────────────────────────

/**
 * POST /generate — streams SSE events.
 * Calls onChunk for text deltas, onDone when generation is complete,
 * onSaved when embed+persist is done, onError on any failure.
 */
export async function generateStream(
  params: {
    job_title: string;
    company: string;
    mode: string;
    mode_label: string;
    jd: string;
    extra: string;
    context: string;
  },
  handlers: {
    onChunk: (text: string) => void;
    onDone: (id: string, wordCount: number) => void;
    onSaved: (id: string) => void;
    onError: (msg: string) => void;
  },
  signal?: AbortSignal
): Promise<void> {
  const res = await fetch(`${BASE}/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
    signal,
  });

  if (!res.ok || !res.body) {
    const txt = await res.text().catch(() => res.statusText);
    handlers.onError(`Backend error ${res.status}: ${txt}`);
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buf += decoder.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() ?? ''; // keep incomplete line in buffer

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const raw = line.slice(6).trim();
      if (!raw) continue;
      try {
        const event = JSON.parse(raw) as GenerateEvent;
        if (event.type === 'chunk') handlers.onChunk(event.text);
        else if (event.type === 'done') handlers.onDone(event.id, event.wordCount);
        else if (event.type === 'saved') handlers.onSaved(event.id);
        else if (event.type === 'error') handlers.onError(event.message);
      } catch {
        // skip malformed SSE line
      }
    }
  }
}

/**
 * POST /search — semantic search via ChromaDB.
 */
export async function searchApplications(
  query: string,
  top_k = 10
): Promise<SearchResultOut[]> {
  const res = await fetch(`${BASE}/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, top_k }),
  });
  if (!res.ok) throw new Error(`Search failed: ${res.status}`);
  return res.json() as Promise<SearchResultOut[]>;
}

/**
 * PATCH /applications/:id/status — update status (and optionally notes).
 */
export async function updateApplicationStatus(
  id: string,
  status: ApplicationStatus,
  notes?: string
): Promise<ApplicationOut> {
  const res = await fetch(`${BASE}/applications/${id}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status, notes }),
  });
  if (!res.ok) throw new Error(`Status update failed: ${res.status}`);
  return res.json() as Promise<ApplicationOut>;
}

/**
 * GET /applications — list all saved applications.
 */
export async function listApplications(): Promise<ApplicationOut[]> {
  const res = await fetch(`${BASE}/applications`);
  if (!res.ok) throw new Error(`List failed: ${res.status}`);
  return res.json() as Promise<ApplicationOut[]>;
}

/**
 * DELETE /applications/:id
 */
export async function deleteApplication(id: string): Promise<void> {
  const res = await fetch(`${BASE}/applications/${id}`, { method: 'DELETE' });
  if (!res.ok && res.status !== 204) throw new Error(`Delete failed: ${res.status}`);
}
