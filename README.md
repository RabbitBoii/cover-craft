# CoverCraft

AI cover letters and application answers, using your personal context file so outputs actually sound like you. Powered by Groq (llama-3.3-70b) — free and fast.

## Setup

```bash
npm install
```

Create a `.env` in the root:

```
VITE_GROQ_KEY=gsk_your_key_here
```

Get your free key at https://console.groq.com

```bash
npm run dev
# → http://localhost:5173
```

## Usage

1. **Context tab** — paste your background or upload a `.txt` file. Saved to localStorage automatically so you only do this once.
2. **Generate tab** — pick a mode, add job title + company, optionally paste the JD.
3. **Output tab** — streams the result live. Copy and go.

## Context file format

Plain `.txt`, structured however you want. Suggested:

```
Name: Chetan
Role target: AI Engineer / Fullstack Developer
Background: IIT Roorkee, M.Sc. Math & Computing, graduating 2025
Current: Frontend intern at Lirion (tokenized real-estate platform)

Key projects:
- Habit AI: Next.js 14, tRPC, Groq/Llama for autonomous goal analysis, deployed Vercel
- [your other projects with impact metrics]

Tone: Direct and technical, no corporate fluff, no "I am passionate about..."
Strengths: LLM integration, RAG systems, shipping fast with Next.js stack
Values: Care about products that actually ship, not just prototypes
```

## Stack

- React 18 + Vite
- Tailwind CSS v3
- Groq API (llama-3.3-70b, streaming)
- localStorage for context persistence