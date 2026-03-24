# Developer Guide — Canonical Dev Commands

This file contains the canonical development, build, test, and packaging commands for contributors and maintainers. These are the authoritative dev commands — the `QUICK_START.md` is user-facing and references this file for advanced workflows.

## Setup

```powershell
# Install dependencies
npm install

# Build TypeScript into `dist`
npm run build

# Install Playwright browsers (if needed)
npx playwright install chromium
```

## Local Development

```powershell
# Start with auto-reload (TypeScript watch + auto-restart)
npm run dev

# Run a single command in dev mode (uses ts-node / dev runner)
npm run dev -- complete "Course Name" "https://example.com/course" --debug
```

## Test / Quick Sanity

```powershell
# Run the lightweight setup checker
node test-setup.js

# Run unit tests (if available)
npm test
```

## Build & Bundle

```powershell
# Build TypeScript output
npm run build

# Create a distributable bundle using ncc
npm run build:bundle

# Verify bundle is in dist/bundle
dir dist\bundle
```

## Packaging (release)

We provide a zip with the bundle and static assets. The `build:bundle` step creates `dist/bundle` which is packaged into `browser-agent-tool.zip` during the release process.

```powershell
# Create release zip (example)
Compress-Archive -Path dist\bundle\* -DestinationPath browser-agent-tool.zip -Force
```

NOTE: `pkg` was attempted historically but produced import.meta and bytecode warnings. Prefer the `ncc` bundle for now.

## Debugging Troubles

- Zod schema runtime errors: ensure TS build is clean (`npm run build`) and avoid unsupported chained methods in schemas.
- Pino transport issues: logger was simplified to avoid `pino-pretty` runtime transport loading – set `LOG_LEVEL` or `logging.level` in `config/default.yaml`.
- YAML duplicate key errors: validate YAML with a linter or `yaml` Node package before runtime.

## Environment variables (dev)

Use `.env` at project root or set in the shell. Key entries:

- `GROQ_API_KEY` — Groq API key
- `OPENAI_API_KEY` — OpenAI API key
- `OLLAMA_BASE_URL` — Ollama server base URL (e.g., `http://localhost:11434`)
- `AGENT_BROWSER_HEADLESS` — `true|false`
- `AGENT_LOGGING_LEVEL` — `debug|info|warn|error`

## Inspecting Data

Local SQLite database is at `data/agent.db` by default.

```powershell
# Print schema
sqlite3 data/agent.db ".schema"

# Open interactive sqlite3 shell
sqlite3 data/agent.db
```

## Important Commands Reference

- Start (production-like): `npm start -- complete "Course" "URL"`
- Dev (watch): `npm run dev`
- Build: `npm run build`
- Bundle: `npm run build:bundle`
- Quick setup check: `node test-setup.js`

## Release Notes / Tips

- Keep `QUICK_START.md` focused on users; update `DEVELOPER.md` for any developer-facing change.
- When changing config schema, bump types and validate `config/default.yaml` and `.env.example`.
- For CI, run `npx playwright install` and `npm run build` before tests.

---

If you'd like, I can also add a `scripts/` wrapper to auto-run common sequences (build → bundle → zip). Would you like that? 