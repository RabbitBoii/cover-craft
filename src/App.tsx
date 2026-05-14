import { useState, useRef, useEffect } from 'react';
import type { Mode, TabId, EmbedStatus } from './types';
import {
  generateStream,
  listApplications,
  searchApplications,
  deleteApplication,
  updateApplicationStatus,
  type ApplicationOut,
  type SearchResultOut,
  type ApplicationStatus,
} from './lib/api';

const MODES: Mode[] = [
  { id: 'cover_letter', label: 'Cover Letter', icon: '📄', prompt: 'Write a compelling, tailored cover letter' },
  { id: 'why_company', label: 'Why This Company', icon: '🏢', prompt: "Answer 'Why do you want to work here?' authentically and specifically" },
  { id: 'what_interests', label: 'What Interests You', icon: '⚡', prompt: "Answer 'What interests you about this role?' with genuine enthusiasm and specifics" },
  { id: 'strengths', label: 'Strengths for Role', icon: '🎯', prompt: "Answer 'What are your key strengths for this role?' concisely and confidently" },
];

function App() {
  const [tab, setTab] = useState<TabId>('setup');

  // Context
  const [context, setContext] = useState('');
  const [fileName, setFileName] = useState('');

  // Generate form
  const [mode, setMode] = useState('cover_letter');
  const [jobTitle, setJobTitle] = useState('');
  const [company, setCompany] = useState('');
  const [jd, setJd] = useState('');
  const [extra, setExtra] = useState('');

  // Output
  const [output, setOutput] = useState('');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [wordCount, setWordCount] = useState(0);
  const [embedStatus, setEmbedStatus] = useState<EmbedStatus>('idle');

  // History
  const [covers, setCovers] = useState<ApplicationOut[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResultOut[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [statusUpdating, setStatusUpdating] = useState<string | null>(null);

  const fileRef = useRef<HTMLInputElement>(null);
  const outputRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const saved = localStorage.getItem('cc_context');
    const savedName = localStorage.getItem('cc_filename');
    if (saved) { setContext(saved); setFileName(savedName || ''); }
    // Load applications from backend
    listApplications().then(setCovers).catch(console.error);
  }, []);

  useEffect(() => {
    if (output) setWordCount(output.trim().split(/\s+/).filter(Boolean).length);
  }, [output]);

  useEffect(() => {
    if (outputRef.current) outputRef.current.scrollTop = outputRef.current.scrollHeight;
  }, [output]);

  const saveContext = (val: string, name?: string) => {
    setContext(val);
    localStorage.setItem('cc_context', val);
    if (name !== undefined) {
      setFileName(name);
      localStorage.setItem('cc_filename', name);
    }
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => saveContext(ev.target?.result as string, file.name);
    reader.readAsText(file);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (!file || !file.name.endsWith('.txt')) return;
    const reader = new FileReader();
    reader.onload = (ev) => saveContext(ev.target?.result as string, file.name);
    reader.readAsText(file);
  };

  const generate = async () => {
    if (!context.trim()) { setTab('setup'); return; }
    if (!jobTitle.trim() || !company.trim()) return;

    setLoading(true);
    setOutput('');
    setEmbedStatus('idle');
    setTab('output');

    const selectedMode = MODES.find((m) => m.id === mode)!;
    let full = '';

    try {
      await generateStream(
        {
          job_title: jobTitle,
          company,
          mode,
          mode_label: selectedMode.label,
          jd,
          extra,
          context,
        },
        {
          onChunk: (text) => {
            full += text;
            setOutput(full);
          },
          onDone: (_id, _wc) => {
            setEmbedStatus('embedding');
          },
          onSaved: (_id) => {
            setEmbedStatus('done');
            // Refresh history from backend
            listApplications().then(setCovers).catch(console.error);
          },
          onError: (msg) => {
            setEmbedStatus('error');
            if (!full) setOutput(`⚠ Error: ${msg}\n\nMake sure the backend is running:\n  cd backend && uvicorn main:app --reload`);
          },
        }
      );
    } catch (err) {
      setOutput(
        `⚠ Error: ${(err as Error).message}\n\nMake sure the backend is running:\n  cd backend && uvicorn main:app --reload`
      );
      setEmbedStatus('error');
    } finally {
      setLoading(false);
    }
  };

  const copyOutput = async () => {
    await navigator.clipboard.writeText(output);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) { setSearchResults(null); return; }
    setSearching(true);
    try {
      const results = await searchApplications(searchQuery);
      setSearchResults(results);
    } catch (err) {
      console.error('Search error', err);
    } finally {
      setSearching(false);
    }
  };

  const handleDeleteCover = async (id: string) => {
    await deleteApplication(id).catch(console.error);
    setCovers((prev) => prev.filter((c) => c.id !== id));
    if (searchResults) setSearchResults(searchResults.filter((r) => r.id !== id));
  };

  const STATUS_ORDER: ApplicationStatus[] = ['generated', 'applied', 'interview', 'offered', 'rejected'];
  const STATUS_COLORS: Record<ApplicationStatus, string> = {
    generated: '#6366f1',
    applied: '#3b82f6',
    interview: '#f59e0b',
    offered: '#22c55e',
    rejected: '#ef4444',
  };

  const handleStatusChange = async (id: string, newStatus: ApplicationStatus) => {
    setStatusUpdating(id);
    try {
      const updated = await updateApplicationStatus(id, newStatus);
      setCovers((prev) => prev.map((c) => (c.id === id ? { ...c, status: updated.status } : c)));
      if (searchResults) {
        setSearchResults(searchResults.map((r) => (r.id === id ? { ...r, status: updated.status } : r)));
      }
    } catch (err) {
      console.error('Status update error', err);
    } finally {
      setStatusUpdating(null);
    }
  };

  const contextChars = context.length;
  const canGenerate = Boolean(context.trim() && jobTitle.trim() && company.trim());
  const displayCovers: (ApplicationOut | SearchResultOut)[] = searchResults ?? covers;

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

  return (
    <div className="app">
      {/* ── Sidebar ── */}
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">CC</div>
          <span className="brand-name">CoverCraft</span>
        </div>

        <nav className="nav">
          {([
            { id: 'setup' as TabId, icon: '◎', label: 'Context' },
            { id: 'generate' as TabId, icon: '✦', label: 'Generate' },
            { id: 'output' as TabId, icon: '≡', label: 'Output' },
            { id: 'history' as TabId, icon: '◷', label: 'History' },
          ] as const).map((t) => (
            <button
              key={t.id}
              className={`nav-item ${tab === t.id ? 'active' : ''}`}
              onClick={() => setTab(t.id)}
            >
              <span className="nav-icon">{t.icon}</span>
              <span>{t.label}</span>
              {t.id === 'setup' && context && <span className="nav-badge">✓</span>}
              {t.id === 'output' && output && <span className="nav-badge">{wordCount}w</span>}
              {t.id === 'history' && covers.length > 0 && (
                <span className="nav-badge">{covers.length}</span>
              )}
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="model-pill">
            <span className="model-dot" />
            <span>llama-3.3-70b</span>
          </div>
          {context ? (
            <div className="ctx-pill">
              <span className="ctx-dot" />
              <span>{fileName || 'Context active'}</span>
            </div>
          ) : (
            <div className="ctx-pill inactive">
              <span className="ctx-dot inactive" />
              <span>No context</span>
            </div>
          )}
        </div>
      </aside>

      {/* ── Main ── */}
      <main className="main">

        {/* SETUP */}
        {tab === 'setup' && (
          <div className="panel">
            <div className="panel-header">
              <h1>Your Context</h1>
              <p>This becomes the system prompt — the AI will always respond as you.</p>
            </div>

            <div
              className={`drop-zone ${context ? 'has-content' : ''}`}
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
              onClick={() => !context && fileRef.current?.click()}
            >
              {context ? (
                <div className="drop-loaded">
                  <div className="drop-loaded-top">
                    <span className="file-icon">📄</span>
                    <span className="file-name">{fileName || 'Pasted context'}</span>
                    <button
                      className="clear-btn"
                      onClick={(e) => { e.stopPropagation(); saveContext('', ''); }}
                    >
                      Remove
                    </button>
                  </div>
                  <div className="ctx-preview">{context.slice(0, 120)}…</div>
                </div>
              ) : (
                <div className="drop-empty">
                  <div className="drop-icon">↑</div>
                  <p>Drop a <code>.txt</code> file here or click to upload</p>
                </div>
              )}
            </div>
            <input ref={fileRef} type="file" accept=".txt" style={{ display: 'none' }} onChange={handleFile} />

            <div className="divider"><span>or paste directly</span></div>

            <div className="field">
              <textarea
                className="textarea"
                rows={10}
                placeholder={`Name: Chetan\nRole target: AI Engineer / Fullstack\nBackground: IIT Roorkee, M.Sc. Math & Computing...\nKey projects: Habit AI (Next.js, tRPC, Groq/Llama)...\nTone: Direct, technical, no fluff\nStrengths: shipped RAG systems, LLM integration...`}
                value={context}
                onChange={(e) => saveContext(e.target.value)}
              />
              <div className="field-meta">
                <span>{contextChars.toLocaleString()} chars</span>
                {contextChars > 0 && <span style={{ color: '#4ade80' }}>Saved locally ✓</span>}
              </div>
            </div>

            <button className="btn-primary" onClick={() => setTab('generate')} disabled={!context.trim()}>
              Continue to Generate →
            </button>
          </div>
        )}

        {/* GENERATE */}
        {tab === 'generate' && (
          <div className="panel">
            <div className="panel-header">
              <h1>Generate</h1>
              <p>Pick a mode, fill in the details, let it rip.</p>
            </div>

            <div className="field">
              <label className="label">Mode</label>
              <div className="mode-grid">
                {MODES.map((m) => (
                  <button
                    key={m.id}
                    className={`mode-card ${mode === m.id ? 'selected' : ''}`}
                    onClick={() => setMode(m.id)}
                  >
                    <span className="mode-icon">{m.icon}</span>
                    <span className="mode-label">{m.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="row">
              <div className="field">
                <label className="label">Job title <span className="required">*</span></label>
                <input
                  className="input"
                  placeholder="e.g. AI Engineer"
                  value={jobTitle}
                  onChange={(e) => setJobTitle(e.target.value)}
                />
              </div>
              <div className="field">
                <label className="label">Company <span className="required">*</span></label>
                <input
                  className="input"
                  placeholder="e.g. Anthropic"
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                />
              </div>
            </div>

            <div className="field">
              <label className="label">Job description <span className="opt">optional but recommended</span></label>
              <textarea
                className="textarea"
                rows={5}
                placeholder="Paste the full JD or key requirements..."
                value={jd}
                onChange={(e) => setJd(e.target.value)}
              />
            </div>

            <div className="field">
              <label className="label">Extra instructions <span className="opt">optional</span></label>
              <input
                className="input"
                placeholder="e.g. keep it under 200 words, emphasize RAG projects, casual tone"
                value={extra}
                onChange={(e) => setExtra(e.target.value)}
              />
            </div>

            {!context.trim() && (
              <div className="warn-banner">
                ⚠ No context set — <button className="warn-link" onClick={() => setTab('setup')}>add it in Setup</button>
              </div>
            )}

            <button className="btn-primary" onClick={generate} disabled={!canGenerate || loading}>
              {loading ? <><span className="spinner" /> Generating…</> : 'Generate ✦'}
            </button>
          </div>
        )}

        {/* OUTPUT */}
        {tab === 'output' && (
          <div className="panel">
            <div className="panel-header">
              <h1>Output</h1>
              {output && !loading && (
                <div className="output-meta">
                  <span>{wordCount} words</span>
                  <span>·</span>
                  <span>{MODES.find((m) => m.id === mode)?.label}</span>
                  <span>·</span>
                  <span>{company} — {jobTitle}</span>
                </div>
              )}
            </div>

            <div className="output-box" ref={outputRef}>
              {loading && !output && (
                <div className="output-loading">
                  <div className="loading-dots"><span /><span /><span /></div>
                  <p>Writing…</p>
                </div>
              )}
              {!output && !loading && (
                <div className="output-empty">
                  <p>Nothing generated yet.</p>
                  <button className="warn-link" onClick={() => setTab('generate')}>Go generate something →</button>
                </div>
              )}
              {output && (
                <div className="output-text">
                  {output}{loading && <span className="cursor" />}
                </div>
              )}
            </div>

            {/* Embed status */}
            {embedStatus !== 'idle' && (
              <div className={`embed-status embed-status--${embedStatus}`}>
                {embedStatus === 'embedding' && <><span className="spinner spinner--dark" /> Embedding with nomic-embed-text…</>}
                {embedStatus === 'done' && '✓ Embedded & saved to History'}
                {embedStatus === 'error' && '⚠ Embedding failed — cover not saved'}
              </div>
            )}

            {output && (
              <div className="output-actions">
                <button className="btn-secondary" onClick={copyOutput}>
                  {copied ? 'Copied ✓' : 'Copy to clipboard'}
                </button>
                <button className="btn-ghost" onClick={() => { setOutput(''); setTab('generate'); }}>
                  Regenerate
                </button>
                <button className="btn-ghost" onClick={() => setTab('history')}>
                  View History →
                </button>
              </div>
            )}
          </div>
        )}

        {/* HISTORY */}
        {tab === 'history' && (
          <div className="panel">
            <div className="panel-header">
              <h1>History</h1>
              <p>All generated covers, searchable by meaning via local embeddings.</p>
            </div>

            <div className="search-row">
              <input
                className="input"
                placeholder='e.g. "AI engineer role emphasizing RAG systems"'
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              />
              <button className="btn-primary" onClick={handleSearch} disabled={searching}>
                {searching ? <span className="spinner" /> : 'Search'}
              </button>
              {searchResults && (
                <button className="btn-ghost" onClick={() => { setSearchResults(null); setSearchQuery(''); }}>
                  Clear
                </button>
              )}
            </div>

            {searchResults && (
              <div className="search-info">
                {searchResults.length} result{searchResults.length !== 1 ? 's' : ''} — ranked by semantic similarity
              </div>
            )}

            {displayCovers.length === 0 && (
              <div className="history-empty">
                <div className="history-empty-icon">◷</div>
                <p>No covers saved yet.</p>
                <button className="warn-link" onClick={() => setTab('generate')}>Generate one →</button>
              </div>
            )}

            <div className="cover-list">
              {displayCovers.map((cover) => {
                const isExpanded = expandedId === cover.id;
                const score = 'score' in cover ? (cover as SearchResultOut).score : null;
                return (
                  <div key={cover.id} className={`cover-card ${isExpanded ? 'expanded' : ''}`}>
                    <div className="cover-card-header">
                      <div className="cover-card-left">
                        <span className="cover-mode-icon">
                          {MODES.find((m) => m.id === cover.mode)?.icon ?? '📄'}
                        </span>
                        <div>
                          <div className="cover-card-title">{cover.company} — {cover.jobTitle}</div>
                          <div className="cover-card-meta">
                            <span>{cover.modeLabel}</span>
                            <span>·</span>
                            <span>{cover.wordCount}w</span>
                            <span>·</span>
                            <span>{formatDate(cover.createdAt)}</span>
                          </div>
                        </div>
                      </div>
                      <div className="cover-card-right">
                        {score !== null && (
                          <span className="score-badge">{(score * 100).toFixed(0)}%</span>
                        )}
                        <select
                          className="status-select"
                          value={cover.status}
                          disabled={statusUpdating === cover.id}
                          style={{ borderColor: STATUS_COLORS[cover.status as ApplicationStatus] ?? '#6366f1' }}
                          onChange={(e) => handleStatusChange(cover.id, e.target.value as ApplicationStatus)}
                        >
                          {STATUS_ORDER.map((s) => (
                            <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                          ))}
                        </select>
                        <button
                          className="btn-ghost btn-sm"
                          onClick={() => setExpandedId(isExpanded ? null : cover.id)}
                        >
                          {isExpanded ? 'Collapse' : 'Expand'}
                        </button>
                        <button
                          className="btn-ghost btn-sm btn-danger"
                          onClick={() => handleDeleteCover(cover.id)}
                        >
                          Delete
                        </button>
                      </div>
                    </div>

                    {!isExpanded && (
                      <div className="cover-card-preview">
                        {cover.text.slice(0, 140)}…
                      </div>
                    )}

                    {isExpanded && (
                      <div className="cover-card-body">
                        {cover.text}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

      </main>
    </div>
  );
}

export default App;
