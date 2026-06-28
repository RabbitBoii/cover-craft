import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion, type Variants } from 'framer-motion';
import logo from '../assets/logo.svg';

/* ─────────────────────────────────────────────────────────────
   Shared motion variants
   ───────────────────────────────────────────────────────────── */

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 24 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.7, ease: [0.21, 0.5, 0.32, 1] },
  },
};

const stagger: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.12, delayChildren: 0.05 } },
};

/** A section that fades its children up as it scrolls into view. */
function Reveal({
  children,
  className,
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  return (
    <motion.div
      className={className}
      variants={fadeUp}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, amount: 0.25 }}
      transition={{ delay }}
    >
      {children}
    </motion.div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Hero
   ───────────────────────────────────────────────────────────── */

const HEADLINE = ['Cover', 'letters', 'that', 'already', 'know', 'you.'];

function Hero() {
  const reduce = useReducedMotion();

  return (
    <header className="relative overflow-hidden px-5 pt-20 pb-12 md:pt-32 md:pb-16">
      <div className="mx-auto flex max-w-3xl flex-col items-center text-center">
        <motion.div
          initial={reduce ? false : { opacity: 0, scale: 0.85, y: -8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
          className="relative mb-8 flex items-center justify-center"
        >
          {/* soft ambient halo — centered precisely on the mark */}
          <div
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-1/2 -z-10 h-[300px] w-[300px] -translate-x-1/2 -translate-y-1/2 rounded-full blur-[80px]"
            style={{
              background:
                'radial-gradient(circle, rgba(232,224,208,0.08) 0%, rgba(167,139,250,0.045) 42%, transparent 72%)',
            }}
          />
          <img
            src={logo}
            alt="CoverCraft"
            className="relative h-16 w-16 rounded-2xl object-cover ring-1 ring-white/10 shadow-[0_0_20px_rgba(167,139,250,0.14)]"
          />
        </motion.div>

        {/* headline — word by word reveal */}
        <motion.h1
          className="font-serif text-[40px] leading-[1.05] tracking-tight text-text-main sm:text-[56px] md:text-[68px]"
          variants={reduce ? undefined : stagger}
          initial={reduce ? false : 'hidden'}
          animate="show"
        >
          {HEADLINE.map((word, i) => (
            <motion.span
              key={i}
              className="inline-block"
              variants={{
                hidden: { opacity: 0, y: '0.4em', filter: 'blur(6px)' },
                show: {
                  opacity: 1,
                  y: '0em',
                  filter: 'blur(0px)',
                  transition: { duration: 0.55, ease: [0.21, 0.5, 0.32, 1] },
                },
              }}
            >
              {word}
              {i < HEADLINE.length - 1 && ' '}
            </motion.span>
          ))}
        </motion.h1>

        <motion.p
          initial={reduce ? false : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.7 }}
          className="mt-6 max-w-xl font-mono text-[13px] leading-relaxed text-text-2 sm:text-[14px]"
        >
          Tell it who you are once. It writes every cover letter and application
          answer like you would.
        </motion.p>

        <motion.div
          initial={reduce ? false : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.9 }}
          className="mt-10 flex flex-col items-center gap-3"
        >
          <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
            <Link
              to="/app"
              className="inline-flex items-center gap-2 rounded-lg bg-accent px-6 py-3 font-mono text-[14px] font-medium text-bg-main shadow-[0_0_0_0_rgba(232,224,208,0)] transition-shadow duration-300 hover:shadow-[0_8px_30px_-8px_rgba(232,224,208,0.45)]"
            >
              Try it free <span aria-hidden>→</span>
            </Link>
          </motion.div>
          <span className="font-mono text-[11px] text-text-3">
            No signup. Runs in your browser.
          </span>
        </motion.div>
      </div>
    </header>
  );
}

/* ─────────────────────────────────────────────────────────────
   Demo card — looping typewriter "generation"
   ───────────────────────────────────────────────────────────── */

const DEMO_TEXT = `Dear Anthropic Hiring Team,

I've spent the last two years shipping RAG systems and LLM integrations — most recently Habit AI, built on Next.js, tRPC, and Llama. I don't recycle my résumé into a cover letter; I connect what I've actually built to what you're trying to do.

Your work on interpretability is exactly the kind of problem I want to sit with for years, not weeks.`;

function useTypewriter(text: string, enabled: boolean) {
  const [count, setCount] = useState(enabled ? 0 : text.length);

  useEffect(() => {
    if (!enabled) {
      setCount(text.length);
      return;
    }
    let i = 0;
    let timer: ReturnType<typeof setTimeout>;

    const type = () => {
      i += 1;
      setCount(i);
      if (i >= text.length) {
        timer = setTimeout(reset, 2800);
        return;
      }
      // slight pause at line breaks, otherwise a fast streaming cadence
      const delay = text[i - 1] === '\n' ? 180 : 16 + Math.random() * 26;
      timer = setTimeout(type, delay);
    };
    const reset = () => {
      i = 0;
      setCount(0);
      timer = setTimeout(type, 600);
    };

    timer = setTimeout(type, 700);
    return () => clearTimeout(timer);
  }, [text, enabled]);

  return count;
}

function DemoCard() {
  const reduce = useReducedMotion();
  const count = useTypewriter(DEMO_TEXT, !reduce);
  const shown = DEMO_TEXT.slice(0, count);
  const done = count >= DEMO_TEXT.length;
  const words = shown.trim() ? shown.trim().split(/\s+/).length : 0;

  return (
    <Reveal className="mx-auto w-full max-w-2xl px-5">
      <div className="overflow-hidden rounded-2xl border border-border-main bg-bg-2 shadow-[0_30px_80px_-40px_rgba(0,0,0,0.9)]">
        {/* window chrome */}
        <div className="flex items-center gap-2 border-b border-border-main bg-bg-3 px-4 py-3">
          <span className="h-3 w-3 rounded-full bg-[#ff5f57]/80" />
          <span className="h-3 w-3 rounded-full bg-[#febc2e]/80" />
          <span className="h-3 w-3 rounded-full bg-[#28c840]/80" />
          <span className="ml-3 truncate font-mono text-[11px] text-text-3">
            cover_letter — anthropic.txt
          </span>
          <span className="ml-auto flex items-center gap-1.5 font-mono text-[10px] text-text-3">
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                done ? 'bg-green-400' : 'bg-purple-400 shadow-[0_0_6px_rgba(167,139,250,0.6)]'
              }`}
            />
            {done ? 'done' : 'generating'}
          </span>
        </div>

        {/* body */}
        <div className="h-[280px] overflow-hidden px-6 py-5 sm:h-[300px]">
          <pre className="whitespace-pre-wrap break-words font-mono text-[12.5px] leading-[1.8] text-text-main sm:text-[13px]">
            {shown}
            {!done && (
              <span className="ml-0.5 inline-block h-[14px] w-[2px] translate-y-[2px] animate-blink bg-accent align-middle" />
            )}
          </pre>
        </div>

        {/* footer meta — mirrors the app's output bar */}
        <div className="flex items-center gap-2 border-t border-border-main px-6 py-3 font-mono text-[11px] text-text-3">
          <span>{words} words</span>
          <span>·</span>
          <span>Cover Letter</span>
          <span>·</span>
          <span>llama-3.3-70b</span>
          <span className="ml-auto text-text-2">in your voice</span>
        </div>
      </div>
    </Reveal>
  );
}

/* ─────────────────────────────────────────────────────────────
   How it works
   ───────────────────────────────────────────────────────────── */

const STEPS = [
  {
    n: '01',
    title: 'Add your context once',
    body: 'Upload a résumé or paste a short profile. It becomes the system prompt — the AI always writes as you.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 16V4" />
        <path d="m7 9 5-5 5 5" />
        <path d="M5 20h14" />
      </svg>
    ),
  },
  {
    n: '02',
    title: 'Drop in company + role',
    body: 'Add the job title, company, and optionally the description. No re-explaining who you are every single time.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 21h18" />
        <path d="M5 21V7l8-4v18" />
        <path d="M19 21V11l-6-4" />
        <path d="M9 9h0M9 13h0M9 17h0" />
      </svg>
    ),
  },
  {
    n: '03',
    title: 'Generate in your voice',
    body: 'Streamed in seconds, then saved and semantically searchable — track every application through to an offer.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1" />
      </svg>
    ),
  },
];

function HowItWorks() {
  return (
    <section className="px-5 py-24 md:py-32">
      <div className="mx-auto max-w-5xl">
        <Reveal className="mb-14 text-center">
          <h2 className="font-serif text-[32px] tracking-tight text-text-main sm:text-[40px]">
            How it works
          </h2>
          <p className="mt-3 font-mono text-[13px] text-text-2">
            Three steps. The first one you only do once.
          </p>
        </Reveal>

        <motion.div
          className="grid gap-5 sm:grid-cols-3"
          variants={stagger}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.2 }}
        >
          {STEPS.map((step) => (
            <motion.div
              key={step.n}
              variants={fadeUp}
              whileHover={{ y: -6 }}
              transition={{ type: 'spring', stiffness: 300, damping: 22 }}
              className="group flex flex-col gap-4 rounded-2xl border border-border-main bg-bg-2 p-6 transition-colors hover:border-border-2"
            >
              <div className="flex items-center justify-between">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-bg-3 text-accent ring-1 ring-border-main transition-colors group-hover:ring-accent/30">
                  {step.icon}
                </span>
                <span className="font-mono text-[12px] text-text-3">{step.n}</span>
              </div>
              <h3 className="font-serif text-[22px] leading-tight text-text-main">
                {step.title}
              </h3>
              <p className="font-mono text-[12.5px] leading-relaxed text-text-2">
                {step.body}
              </p>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────
   Closing CTA + Footer
   ───────────────────────────────────────────────────────────── */

const TECH = ['React', 'FastAPI', 'Groq', 'Pinecone'];

function Footer() {
  return (
    <footer className="border-t border-border-main px-5 py-16">
      <div className="mx-auto max-w-3xl">
        <Reveal className="mb-14 flex flex-col items-center text-center">
          <h2 className="font-serif text-[28px] tracking-tight text-text-main sm:text-[36px]">
            Write the next one in your voice.
          </h2>
          <motion.div
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            className="mt-7"
          >
            <Link
              to="/app"
              className="inline-flex items-center gap-2 rounded-lg bg-accent px-6 py-3 font-mono text-[14px] font-medium text-bg-main transition-shadow duration-300 hover:shadow-[0_8px_30px_-8px_rgba(232,224,208,0.45)]"
            >
              Try it free <span aria-hidden>→</span>
            </Link>
          </motion.div>
        </Reveal>

        <Reveal className="flex flex-col items-center gap-6">
          <div className="flex flex-wrap items-center justify-center gap-2">
            {TECH.map((t) => (
              <span
                key={t}
                className="rounded-full border border-border-main bg-bg-2 px-3 py-1 font-mono text-[11px] text-text-2"
              >
                {t}
              </span>
            ))}
          </div>

          <div className="flex items-center gap-5 font-mono text-[12px] text-text-2">
            <a
              href="https://github.com/RabbitBoii/cover-craft"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 transition-colors hover:text-text-main"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
                <path d="M12 2C6.48 2 2 6.58 2 12.25c0 4.53 2.87 8.37 6.84 9.73.5.1.68-.22.68-.49 0-.24-.01-.87-.01-1.71-2.78.62-3.37-1.37-3.37-1.37-.45-1.18-1.11-1.49-1.11-1.49-.91-.64.07-.62.07-.62 1 .07 1.53 1.06 1.53 1.06.89 1.56 2.34 1.11 2.91.85.09-.66.35-1.11.63-1.36-2.22-.26-4.56-1.14-4.56-5.07 0-1.12.39-2.03 1.03-2.75-.1-.26-.45-1.3.1-2.71 0 0 .84-.27 2.75 1.05A9.4 9.4 0 0 1 12 6.84c.85 0 1.71.12 2.51.34 1.91-1.32 2.75-1.05 2.75-1.05.55 1.41.2 2.45.1 2.71.64.72 1.03 1.63 1.03 2.75 0 3.94-2.34 4.81-4.57 5.06.36.32.68.94.68 1.9 0 1.37-.01 2.47-.01 2.81 0 .27.18.6.69.49A10.04 10.04 0 0 0 22 12.25C22 6.58 17.52 2 12 2Z" />
              </svg>
              GitHub
            </a>
            <span className="text-text-3">Built by Chetan Atram.</span>
          </div>
        </Reveal>
      </div>
    </footer>
  );
}

/* ─────────────────────────────────────────────────────────────
   Page
   ───────────────────────────────────────────────────────────── */

export default function Landing() {
  // The app shell uses h-screen/overflow-hidden; the landing scrolls normally.
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <div ref={ref} className="min-h-screen w-full overflow-x-hidden bg-bg-main">
      {/* slim top bar */}
      <nav className="mx-auto flex max-w-5xl items-center justify-between px-5 py-5">
        <div className="flex items-center gap-2.5">
          <img
            src={logo}
            alt="CoverCraft"
            className="h-8 w-8 rounded-lg object-cover ring-1 ring-white/10"
          />
          <span className="font-serif text-[18px] tracking-tight text-text-main">
            CoverCraft
          </span>
        </div>
        <Link
          to="/app"
          className="font-mono text-[12px] text-text-2 transition-colors hover:text-text-main"
        >
          Open app →
        </Link>
      </nav>

      <Hero />

      <section className="px-0 pb-24">
        <Reveal className="mb-10 px-5 text-center">
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-text-3">
            Live preview
          </p>
        </Reveal>
        <DemoCard />
      </section>

      <HowItWorks />
      <Footer />
    </div>
  );
}
