import { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import logo from './assets/logo.svg';
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

const CONTEXT_PROMPT = `I'm setting up a tool that writes cover letters and job-application answers in my voice. Help me build a "context" profile it will use as its system prompt.

If I've pasted my resume below, use it as the primary source — pull my background, education, experience, projects (with concrete details and impact), and skills directly from it. Don't ask me to repeat anything that's already in the resume.

Then ask me a short batch of follow-up questions covering only what a resume can't tell you:
- What roles/industries am I targeting right now (may differ from my past experience)
- The tone I want to come across as (e.g. direct, warm, technical, understated)
- Clichés, buzzwords, or phrases I never want to appear (e.g. "passionate", "thrilled", "synergy")
- Anything about culture, team, or work style I want to emphasize or avoid
- Anything I'm currently learning or want to lean into that my resume doesn't show yet

If I haven't pasted a resume, instead interview me with one batch of short questions covering: name and target roles, background (education, experience, current title), 2-4 key projects with concrete impact, core skills and strengths, the tone I want, and what I want to avoid.

Once you have what you need, output the result as plain text in this shape, filled in from my answers:

Name: ...
Role target: ...
Background: ...
Key projects: ...
Tone: ...
Strengths: ...
What I want: ...
What I don't want: ...

Keep it specific and honest — no filler. Reference actual project names, numbers, and tech from my resume rather than generic descriptions. Give me only the final plain-text block so I can save it as context.txt.

---
My resume (optional — paste below):`


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
  const [promptCopied, setPromptCopied] = useState(false);
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
            listApplications().then(setCovers).catch(console.error);
          },
          onError: (msg) => {
            setEmbedStatus('error');
            if (!full) setOutput(`⚠ Error: ${msg}\n\nMake sure the backend is running:\n  cd backend && uvicorn main:app --reload`);
          },
        }
      );
    } catch (err) {
      setOutput(`⚠ Error: ${(err as Error).message}\n\nMake sure the backend is running:\n  cd backend && uvicorn main:app --reload`);
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

  const copyContextPrompt = async () => {
    await navigator.clipboard.writeText(CONTEXT_PROMPT);
    setPromptCopied(true);
    setTimeout(() => setPromptCopied(false), 2000);
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
    <div className="flex h-screen overflow-hidden">
      {/* ── Sidebar (desktop only) ── */}
      <aside className="hidden md:flex w-[280px] min-w-[280px] bg-bg-2 border-r border-border-main flex-col px-4 py-6 gap-8">
        <Link to="/" className="flex items-center gap-2.5 no-underline">
          <img src={logo} alt="CoverCraft" className="w-9 h-9 rounded-lg object-cover ring-1 ring-white/10 shadow-[0_0_14px_rgba(167,139,250,0.22)]" />
          <span className="font-serif text-[18px] text-text-main tracking-tight">CoverCraft</span>
        </Link>

        <nav className="flex flex-col gap-0.5">
          {([
            { id: 'setup' as TabId, icon: '◎', label: 'Context' },
            { id: 'generate' as TabId, icon: '✦', label: 'Generate' },
            { id: 'output' as TabId, icon: '≡', label: 'Output' },
            { id: 'history' as TabId, icon: '◷', label: 'History' },
          ] as const).map((t) => (
            <button
              key={t.id}
              className={`flex items-center gap-2.5 px-2.5 py-2 rounded-md border-none text-left font-mono text-[13px] transition-all duration-150 w-full cursor-pointer hover:bg-bg-3 hover:text-text-main ${tab === t.id ? 'bg-bg-4 text-text-main' : 'bg-transparent text-text-2'}`}
              onClick={() => setTab(t.id)}
            >
              <span className="text-sm min-w-[16px]">{t.icon}</span>
              <span>{t.label}</span>
              {t.id === 'setup' && context && <span className="ml-auto text-[11px] text-green-400 bg-green-400/10 px-1.5 py-0.5 rounded">✓</span>}
              {t.id === 'output' && output && <span className="ml-auto text-[11px] text-green-400 bg-green-400/10 px-1.5 py-0.5 rounded">{wordCount}w</span>}
              {t.id === 'history' && covers.length > 0 && (
                <span className="ml-auto text-[11px] text-green-400 bg-green-400/10 px-1.5 py-0.5 rounded">{covers.length}</span>
              )}
            </button>
          ))}
        </nav>

        <div className="mt-auto">
          <div className="flex items-center gap-1.5 text-[11px] text-text-3 px-2.5 py-1.5 mb-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-purple-400 shrink-0 shadow-[0_0_6px_rgba(167,139,250,0.5)]" />
            <span>gpt-oss-120b</span>
          </div>
          {context ? (
            <div className="flex items-center gap-1.5 text-xs text-text-2 px-2.5 py-2 rounded-md bg-bg-3 border border-border-main overflow-hidden">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 shrink-0" />
              <span className="truncate">{fileName || 'Context active'}</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-xs text-text-2 px-2.5 py-2 rounded-md bg-bg-3 border border-border-main overflow-hidden opacity-50">
              <span className="w-1.5 h-1.5 rounded-full bg-text-3 shrink-0" />
              <span>No context</span>
            </div>
          )}
        </div>
      </aside>

      {/* ── Mobile Top Header ── */}
      <header className="md:hidden fixed top-0 left-0 right-0 z-50 bg-bg-2/95 backdrop-blur border-b border-border-main flex items-center justify-between px-4 py-3">
        <Link to="/" className="flex items-center gap-2.5 no-underline">
          <img src={logo} alt="CoverCraft" className="w-8 h-8 rounded-lg object-cover ring-1 ring-white/10 shadow-[0_0_12px_rgba(167,139,250,0.22)]" />
          <span className="font-serif text-[16px] text-text-main tracking-tight">CoverCraft</span>
        </Link>
        <div className="flex items-center gap-1.5">
          {context && (
            <div className="flex items-center gap-1.5 text-[11px] text-text-2 px-2 py-1 rounded-md bg-bg-3 border border-border-main">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 shrink-0" />
              <span className="truncate max-w-[100px]">{fileName || 'Context active'}</span>
            </div>
          )}
          <div className="flex items-center gap-1 text-[10px] text-text-3 px-2 py-1">
            <span className="w-1.5 h-1.5 rounded-full bg-purple-400 shadow-[0_0_6px_rgba(167,139,250,0.5)]" />
            <span>llama-3.3-70b</span>
          </div>
        </div>
      </header>

      {/* ── Mobile Bottom Tab Bar ── */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-bg-2/95 backdrop-blur border-t border-border-main flex items-center justify-around px-2 py-2 safe-area-inset-bottom">
        {([
          { id: 'setup' as TabId, icon: '◎', label: 'Context' },
          { id: 'generate' as TabId, icon: '✦', label: 'Generate' },
          { id: 'output' as TabId, icon: '≡', label: 'Output' },
          { id: 'history' as TabId, icon: '◷', label: 'History' },
        ] as const).map((t) => (
          <button
            key={t.id}
            className={`flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl border-none cursor-pointer transition-all duration-150 min-w-[60px] ${tab === t.id
              ? 'bg-bg-4 text-text-main'
              : 'bg-transparent text-text-3'
              }`}
            onClick={() => setTab(t.id)}
          >
            <span className="text-base leading-none relative">
              {t.icon}
              {t.id === 'setup' && context && (
                <span className="absolute -top-1 -right-1.5 w-1.5 h-1.5 rounded-full bg-green-400" />
              )}
              {t.id === 'output' && output && (
                <span className="absolute -top-1 -right-1.5 w-1.5 h-1.5 rounded-full bg-green-400" />
              )}
              {t.id === 'history' && covers.length > 0 && (
                <span className="absolute -top-1 -right-1.5 w-1.5 h-1.5 rounded-full bg-green-400" />
              )}
            </span>
            <span className="font-mono text-[10px] tracking-wide">{t.label}</span>
          </button>
        ))}
      </nav>

      {/* ── Main ── */}
      <main className="flex-1 overflow-y-auto px-4 md:px-8 lg:px-16 pt-20 md:pt-12 pb-24 md:pb-12 max-w-[860px] mx-auto w-full">

        {/* SETUP */}
        {tab === 'setup' && (
          <div className="flex flex-col gap-6">
            <div>
              <h1 className="font-serif text-[28px] md:text-[32px] font-normal tracking-tight text-text-main mb-1">Your Context</h1>
              <p className="text-[13px] text-text-2">This becomes the system prompt — the AI will always respond as you.</p>
            </div>

            {/* How to create a context — collapsible guide */}
            <details className="group bg-bg-2 border border-border-main rounded-lg overflow-hidden">
              <summary className="flex items-center gap-2.5 px-4 py-3 cursor-pointer list-none text-[13px] text-text-main hover:bg-bg-3 transition-colors">
                <span className="text-accent">✦</span>
                <span className="flex-1">New here? Generate your context with ChatGPT, Claude, or any LLM</span>
                <span className="text-text-3 text-xs transition-transform group-open:rotate-90">›</span>
              </summary>
              <div className="px-4 pb-4 pt-1 border-t border-border-main flex flex-col gap-3">
                <p className="text-[13px] text-text-2 leading-relaxed">
                  Don't have a context file yet? Copy the prompt below, paste it into your favorite LLM,
                  answer its questions, then save the plain-text result as <code className="text-accent bg-bg-3 px-1.5 py-0.5 rounded">context.txt</code> and upload it here (or paste it directly).
                </p>
                <div className="relative">
                  <pre className="bg-bg-main border border-border-main rounded-lg text-text-2 font-mono text-[12px] leading-relaxed p-3.5 pr-24 whitespace-pre-wrap max-h-[220px] overflow-y-auto">{CONTEXT_PROMPT}</pre>
                  <button
                    className="absolute top-2.5 right-2.5 bg-accent text-bg-main border-none rounded px-2.5 py-1.5 font-mono text-[11px] font-medium cursor-pointer transition-opacity hover:opacity-90"
                    onClick={copyContextPrompt}
                  >
                    {promptCopied ? 'Copied ✓' : 'Copy prompt'}
                  </button>
                </div>
              </div>
            </details>

            <div
              className={`border border-dashed border-border-2 rounded-lg p-8 cursor-pointer transition-colors bg-bg-2 hover:border-accent hover:bg-bg-3`}
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
              onClick={() => !context && fileRef.current?.click()}
            >
              {context ? (
                <div>
                  <div className="flex items-center gap-2.5 mb-3">
                    <span className="text-lg">📄</span>
                    <span className="text-[13px] text-text-main flex-1 truncate">{fileName || 'Pasted context'}</span>
                    <button
                      className="bg-transparent border border-border-2 text-text-2 px-2.5 py-1 rounded text-xs cursor-pointer font-mono transition-colors hover:border-red-400 hover:text-red-400"
                      onClick={(e) => { e.stopPropagation(); saveContext('', ''); }}
                    >
                      Remove
                    </button>
                  </div>
                  <div className="text-xs text-text-3 leading-relaxed font-mono whitespace-pre-wrap">{context.slice(0, 120)}…</div>
                </div>
              ) : (
                <div className="text-center">
                  <div className="text-[28px] text-text-3 mb-3">↑</div>
                  <p className="text-[13px] text-text-2">Drop a <code className="text-accent bg-bg-3 px-1.5 py-0.5 rounded">.txt</code> file here or click to upload</p>
                </div>
              )}
            </div>
            <input ref={fileRef} type="file" accept=".txt" style={{ display: 'none' }} onChange={handleFile} />

            <div className="flex items-center gap-4 text-text-3 text-xs before:content-[''] before:flex-1 before:h-px before:bg-border-main after:content-[''] after:flex-1 after:h-px after:bg-border-main">
              <span>or paste directly</span>
            </div>

            <div className="flex flex-col gap-1.5">
              <textarea
                className="bg-bg-2 border border-border-main rounded-lg text-text-main font-mono text-[13px] px-3.5 py-3 outline-none transition-colors resize-y w-full min-h-[120px] leading-relaxed focus:border-border-2 placeholder:text-text-3"
                rows={10}
                placeholder={`Name: Chetan\nRole target: AI Engineer / Fullstack\nBackground: IIT Roorkee, M.Sc. Math & Computing...\nKey projects: Habit AI (Next.js, tRPC, Groq/Llama)...\nTone: Direct, technical, no fluff\nStrengths: shipped RAG systems, LLM integration...`}
                value={context}
                onChange={(e) => saveContext(e.target.value)}
              />
              <div className="flex justify-between text-[11px] text-text-3">
                <span>{contextChars.toLocaleString()} chars</span>
                {contextChars > 0 && <span className="text-green-400">Saved locally ✓</span>}
              </div>
            </div>

            <button
              className="bg-accent text-bg-main border-none rounded-lg px-5 py-[11px] font-mono text-[13px] font-medium cursor-pointer transition-opacity self-start flex items-center gap-2 hover:opacity-90 disabled:opacity-35 disabled:cursor-not-allowed"
              onClick={() => setTab('generate')}
              disabled={!context.trim()}
            >
              Continue to Generate →
            </button>
          </div>
        )}

        {/* GENERATE */}
        {tab === 'generate' && (
          <div className="flex flex-col gap-6">
            <div>
              <h1 className="font-serif text-[28px] md:text-[32px] font-normal tracking-tight text-text-main mb-1">Generate</h1>
              <p className="text-[13px] text-text-2">Pick a mode, fill in the details, let it rip.</p>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-text-2 tracking-[0.04em] uppercase">Mode</label>
              <div className="grid grid-cols-2 gap-2">
                {MODES.map((m) => (
                  <button
                    key={m.id}
                    className={`flex items-center gap-2.5 px-3.5 py-3 rounded-lg border bg-bg-2 text-text-2 cursor-pointer font-mono text-[13px] transition-colors text-left hover:border-border-2 hover:text-text-main hover:bg-bg-3 ${mode === m.id ? 'border-accent text-text-main bg-bg-3' : 'border-border-main'}`}
                    onClick={() => setMode(m.id)}
                  >
                    <span className="text-base">{m.icon}</span>
                    <span className="text-[13px]">{m.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-text-2 tracking-[0.04em] uppercase">Job title <span className="text-amber-500">*</span></label>
                <input
                  className="bg-bg-2 border border-border-main rounded-lg text-text-main font-mono text-[13px] px-3.5 py-2.5 outline-none transition-colors w-full focus:border-border-2 placeholder:text-text-3"
                  placeholder="e.g. AI Engineer"
                  value={jobTitle}
                  onChange={(e) => setJobTitle(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-text-2 tracking-[0.04em] uppercase">Company <span className="text-amber-500">*</span></label>
                <input
                  className="bg-bg-2 border border-border-main rounded-lg text-text-main font-mono text-[13px] px-3.5 py-2.5 outline-none transition-colors w-full focus:border-border-2 placeholder:text-text-3"
                  placeholder="e.g. Anthropic"
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-text-2 tracking-[0.04em] uppercase">Job description <span className="normal-case tracking-normal text-text-3 text-[11px]">optional but recommended</span></label>
              <textarea
                className="bg-bg-2 border border-border-main rounded-lg text-text-main font-mono text-[13px] px-3.5 py-3 outline-none transition-colors resize-y w-full min-h-[120px] leading-relaxed focus:border-border-2 placeholder:text-text-3"
                rows={5}
                placeholder="Paste the full JD or key requirements..."
                value={jd}
                onChange={(e) => setJd(e.target.value)}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-text-2 tracking-[0.04em] uppercase">Extra instructions <span className="normal-case tracking-normal text-text-3 text-[11px]">optional</span></label>
              <input
                className="bg-bg-2 border border-border-main rounded-lg text-text-main font-mono text-[13px] px-3.5 py-2.5 outline-none transition-colors w-full focus:border-border-2 placeholder:text-text-3"
                placeholder="e.g. keep it under 200 words, emphasize RAG projects, casual tone"
                value={extra}
                onChange={(e) => setExtra(e.target.value)}
              />
            </div>

            {!context.trim() && (
              <div className="px-3.5 py-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-500 text-[13px]">
                ⚠ No context set — <button className="bg-transparent border-none text-accent cursor-pointer font-mono text-[13px] underline p-0" onClick={() => setTab('setup')}>add it in Setup</button>
              </div>
            )}

            <button
              className="bg-accent text-bg-main border-none rounded-lg px-5 py-[11px] font-mono text-[13px] font-medium cursor-pointer transition-opacity self-start flex items-center gap-2 hover:opacity-90 disabled:opacity-35 disabled:cursor-not-allowed"
              onClick={generate}
              disabled={!canGenerate || loading}
            >
              {loading ? <><span className="inline-block w-[13px] h-[13px] border-2 border-bg-main/30 border-t-bg-main rounded-full animate-spin" /> Generating…</> : 'Generate ✦'}
            </button>
          </div>
        )}

        {/* OUTPUT */}
        {tab === 'output' && (
          <div className="flex flex-col gap-6">
            <div>
              <h1 className="font-serif text-[28px] md:text-[32px] font-normal tracking-tight text-text-main mb-1">Output</h1>
              {output && !loading && (
                <div className="flex gap-2 text-xs text-text-3 mt-1 flex-wrap">
                  <span>{wordCount} words</span>
                  <span>·</span>
                  <span>{MODES.find((m) => m.id === mode)?.label}</span>
                  <span>·</span>
                  <span>{company} — {jobTitle}</span>
                </div>
              )}
            </div>

            <div className="bg-bg-2 border border-border-main rounded-xl p-7 min-h-[300px] max-h-[60vh] overflow-y-auto" ref={outputRef}>
              {loading && !output && (
                <div className="flex flex-col items-center justify-center h-[200px] gap-3 text-text-3 text-[13px]">
                  <div className="flex gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-text-3 animate-pulse-dot" />
                    <span className="w-1.5 h-1.5 rounded-full bg-text-3 animate-pulse-dot delay-200" />
                    <span className="w-1.5 h-1.5 rounded-full bg-text-3 animate-pulse-dot delay-400" />
                  </div>
                  <p>Writing…</p>
                </div>
              )}
              {!output && !loading && (
                <div className="flex flex-col items-center justify-center h-[200px] gap-3 text-text-3 text-[13px]">
                  <p>Nothing generated yet.</p>
                  <button className="bg-transparent border-none text-accent cursor-pointer font-mono text-[13px] underline p-0" onClick={() => setTab('generate')}>Go generate something →</button>
                </div>
              )}
              {output && (
                <div className="font-mono text-[13.5px] leading-[1.85] text-text-main whitespace-pre-wrap break-words">
                  {output}{loading && <span className="inline-block w-[2px] h-[14px] bg-accent ml-0.5 align-middle animate-blink" />}
                </div>
              )}
            </div>

            {/* Embed status */}
            {embedStatus !== 'idle' && (
              <div className={`flex items-center gap-2 text-xs px-3.5 py-2 rounded-lg border transition-colors ${embedStatus === 'embedding' ? 'text-text-2 bg-bg-2 border-border-main' :
                embedStatus === 'done' ? 'text-green-400 bg-green-400/10 border-green-400/20' :
                  'text-red-400 bg-red-400/10 border-red-400/20'
                }`}>
                {embedStatus === 'embedding' && <><span className="inline-block w-[13px] h-[13px] border-2 border-white/15 border-t-text-2 rounded-full animate-spin" /> Embedding with nomic-embed-text…</>}
                {embedStatus === 'done' && '✓ Embedded & saved to History'}
                {embedStatus === 'error' && '⚠ Embedding failed — cover not saved'}
              </div>
            )}

            {output && (
              <div className="flex flex-wrap gap-2.5">
                <button
                  className="bg-bg-3 text-text-main border border-border-2 rounded-lg px-4.5 py-[9px] font-mono text-[13px] cursor-pointer transition-colors hover:bg-bg-4"
                  onClick={copyOutput}
                >
                  {copied ? 'Copied ✓' : 'Copy to clipboard'}
                </button>
                <button
                  className="bg-transparent text-text-2 border border-border-main rounded-lg px-4.5 py-[9px] font-mono text-[13px] cursor-pointer transition-colors hover:text-text-main hover:border-border-2"
                  onClick={() => { setOutput(''); setTab('generate'); }}
                >
                  Regenerate
                </button>
                <button
                  className="bg-transparent text-text-2 border border-border-main rounded-lg px-4.5 py-[9px] font-mono text-[13px] cursor-pointer transition-colors hover:text-text-main hover:border-border-2"
                  onClick={() => setTab('history')}
                >
                  View History →
                </button>
              </div>
            )}
          </div>
        )}

        {/* HISTORY */}
        {tab === 'history' && (
          <div className="flex flex-col gap-6">
            <div>
              <h1 className="font-serif text-[28px] md:text-[32px] font-normal tracking-tight text-text-main mb-1">History</h1>
              <p className="text-[13px] text-text-2">All generated covers, searchable by meaning via local embeddings.</p>
            </div>

            <div className="flex gap-2 items-center">
              <input
                className="flex-1 bg-bg-2 border border-border-main rounded-lg text-text-main font-mono text-[13px] px-3.5 py-2.5 outline-none transition-colors focus:border-border-2 placeholder:text-text-3"
                placeholder='e.g. "AI engineer role emphasizing RAG systems"'
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              />
              <button
                className="bg-accent text-bg-main border-none rounded-lg px-5 py-[11px] font-mono text-[13px] font-medium cursor-pointer transition-opacity flex items-center gap-2 hover:opacity-90 disabled:opacity-35 disabled:cursor-not-allowed"
                onClick={handleSearch}
                disabled={searching}
              >
                {searching ? <span className="inline-block w-[13px] h-[13px] border-2 border-bg-main/30 border-t-bg-main rounded-full animate-spin" /> : 'Search'}
              </button>
              {searchResults && (
                <button
                  className="bg-transparent text-text-2 border border-border-main rounded-lg px-4.5 py-[9px] font-mono text-[13px] cursor-pointer transition-colors hover:text-text-main hover:border-border-2"
                  onClick={() => { setSearchResults(null); setSearchQuery(''); }}
                >
                  Clear
                </button>
              )}
            </div>

            {searchResults && (
              <div className="text-xs text-text-3 -mt-2">
                {searchResults.length} result{searchResults.length !== 1 ? 's' : ''} — ranked by semantic similarity
              </div>
            )}

            {displayCovers.length === 0 && (
              <div className="flex flex-col items-center gap-2.5 py-16 px-8 text-text-3 text-[13px]">
                <div className="text-4xl opacity-30">◷</div>
                <p>No covers saved yet.</p>
                <button className="bg-transparent border-none text-accent cursor-pointer font-mono text-[13px] underline p-0" onClick={() => setTab('generate')}>Generate one →</button>
              </div>
            )}

            <div className="flex flex-col gap-2.5">
              {displayCovers.map((cover) => {
                const isExpanded = expandedId === cover.id;
                const score = 'score' in cover ? (cover as SearchResultOut).score : null;
                return (
                  <div key={cover.id} className={`bg-bg-2 border rounded-xl p-4 flex flex-col gap-2.5 transition-colors hover:border-border-2 ${isExpanded ? 'border-border-2' : 'border-border-main'}`}>
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div className="flex items-start gap-3 flex-1 min-w-0">
                        <span className="text-lg shrink-0 mt-0.5">
                          {MODES.find((m) => m.id === cover.mode)?.icon ?? '📄'}
                        </span>
                        <div className="min-w-0">
                          <div className="text-[13px] text-text-main font-medium truncate">{cover.company} — {cover.jobTitle}</div>
                          <div className="flex gap-1.5 text-[11px] text-text-3 mt-0.5 flex-wrap">
                            <span>{cover.modeLabel}</span>
                            <span>·</span>
                            <span>{cover.wordCount}w</span>
                            <span>·</span>
                            <span>{formatDate(cover.createdAt)}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-start sm:justify-end">
                        {score !== null && (
                          <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-purple-400/10 text-purple-400 border border-purple-400/20">{(score * 100).toFixed(0)}%</span>
                        )}
                        <select
                          className="appearance-none bg-transparent border border-border-main rounded-lg font-mono text-[11px] py-1 pl-2.5 pr-6 cursor-pointer transition-colors outline-none bg-no-repeat bg-[right_6px_center] bg-[length:8px_auto] hover:border-border-2 disabled:opacity-50 disabled:cursor-not-allowed bg-chevron-down"
                          value={cover.status}
                          disabled={statusUpdating === cover.id}
                          style={{ color: STATUS_COLORS[cover.status as ApplicationStatus] ?? 'var(--text-2)' }}
                          onChange={(e) => handleStatusChange(cover.id, e.target.value as ApplicationStatus)}
                        >
                          {STATUS_ORDER.map((s) => (
                            <option key={s} value={s} className="bg-bg-2 text-text-main">{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                          ))}
                        </select>
                        <button
                          className="bg-transparent text-text-2 border border-border-main rounded-lg px-2.5 py-1 font-mono text-[11px] cursor-pointer transition-colors hover:text-text-main hover:border-border-2"
                          onClick={() => setExpandedId(isExpanded ? null : cover.id)}
                        >
                          {isExpanded ? 'Collapse' : 'Expand'}
                        </button>
                        <button
                          className="bg-transparent text-text-2 border border-border-main rounded-lg px-2.5 py-1 font-mono text-[11px] cursor-pointer transition-colors hover:text-red-400 hover:border-red-400"
                          onClick={() => handleDeleteCover(cover.id)}
                        >
                          Delete
                        </button>
                      </div>
                    </div>

                    {!isExpanded && (
                      <div className="text-xs text-text-3 leading-relaxed font-mono">
                        {cover.text.slice(0, 140)}…
                      </div>
                    )}

                    {isExpanded && (
                      <div className="text-[13px] text-text-main leading-[1.85] whitespace-pre-wrap break-words font-mono border-t border-border-main pt-3">
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
