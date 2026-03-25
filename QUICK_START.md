# Quick Start

Minimal steps to install and run the Browser Course Completion Agent (user-facing).

## Prerequisites

- Node.js 18+
- npm 9+
- Chrome/Chromium installed
- API key from Groq, OpenAI, or Ollama (for AI features)

## Install

```bash
# Install dependencies
npm install

# Build (optional for rapid dev you can use `npm run dev`)

```

## Configure (recommended)

Copy the template and add your keys:

```bash
copy .env.example .env
notepad .env
```

You can also edit `config/default.yaml` to change providers and defaults.

## Run (quick)

```bash
# Interactive launcher
node main.js

# Or run direct command
npm start -- complete "Course Name" "https://example.com/course"
```

You can optionally select which LLM provider to use at runtime with `--provider` (overrides `config/default.yaml` mappings):

```bash
# Use the `openai` provider configured in `config/default.yaml`
npm start -- complete "Course Name" "https://example.com/course" -- --provider openai
```

If you don't pass `--provider`, the agent uses the task-to-provider mapping in `config/default.yaml` (the `llm.taskMapping` entry) or the `llm.defaultProvider` fallback.

## Troubleshooting (quick)

- If API key missing: ensure `.env` contains `GROQ_API_KEY` or `OPENAI_API_KEY`.
- If browser fails: install Playwright browsers: `npx playwright install chromium`.
- If module/build errors: `npm install` then `npm run build`.

## Developer & Testing Guide

Advanced development and canonical test commands live in `DEVELOPER.md` (detailed dev workflow, testing commands, build and release steps).

---

For full developer instructions, run:

```bash
notepad DEVELOPER.md
```

**Ready?**

```bash
npm run build
npm start -- complete "Your Course Name" "https://your-course-url"
```

