# Browser Course Completion Agent

An intelligent AI-powered browser automation system designed to automatically complete online courses using multi-agent orchestration, LLM providers, and Playwright.

## Features

- 🤖 **Multi-Agent Architecture**: Specialized agents for video, quiz, and reading content
- 🧠 **LLM Integration**: Support for Groq, OpenAI, Ollama, and any OpenAI-compatible API
- 📊 **Local Database**: SQLite-based progress tracking and DOM caching
- 🔄 **Persistent Sessions**: Chrome profile management for maintaining user sessions
- ⚡ **Optimized**: Token-efficient LLM context using aggressive HTML sanitization
- 📝 **Progress Tracking**: Real-time course completion tracking and resume capability

## Architecture

```
CLI Interface
    ↓
Orchestrator Agent (Boss)
    ├─ Video Handler Agent
    ├─ Quiz Handler Agent  
    ├─ Reader Handler Agent
    └─ Page Classifier
    ↓
Browser Controller (Playwright)
    ├─ Browser Tools (Navigation, Content, Video, Form, Detection)
    ├─ LLM Provider Layer (Groq, OpenAI, Ollama)
    └─ Local Database (Repositories)
```

## Quick Start

### 1. Installation

```bash
npm install
```

### 2. Configuration

Copy `.env.example` to `.env` and set your LLM provider keys:

```bash
GROQ_API_KEY=gsk_your_key_here
# or
OPENAI_API_KEY=sk_your_key_here
```

### 3. Run

```bash
npm run build
npm start -- complete "Course Name" "https://example.com/course"
```

Or in development:

```bash
npm run dev -- complete "Course Name" "https://example.com/course"
```

## Configuration

### config/default.yaml

Main configuration file with browser, agent, LLM provider, and database settings:

```yaml
browser:
  headless: false              # Set to true for headless mode
  navigationTimeout: 60000     # Page navigation timeout in ms

agent:
  maxRetries: 3                # Retry failed sections

logging:
  level: "info"                # "debug" | "info" | "warn" | "error"

defaultProvider: "groq"        # Default LLM provider

providers:
  groq:
    model: "llama-3.3-70b-versatile"
    temperature: 0.3
  openai:
    model: "gpt-4-turbo-preview"
  ollama:
    baseUrl: "http://localhost:11434/v1"
    model: "mistral"
```

### Environment Variables

```bash
# LLM Keys (auto-configured from providers.yaml)
GROQ_API_KEY=gsk_xxxxx
OPENAI_API_KEY=sk-xxxxx
OLLAMA_BASE_URL=http://localhost:11434

# Override config via env (format: AGENT_SECTION_KEY)
AGENT_BROWSER_HEADLESS=true
AGENT_LOGGING_LEVEL=debug
```

## Module Overview

### 1. Browser Tools (`src/browser-tools/`)

Standalone Playwright tools providing clean abstraction:

- **Navigation**: click, type, navigate, scroll, goBack, goForward
- **Content**: extractDOMForLLM, extractInteractiveElements, getTextContent
- **Video**: detectVideo, controlVideo, waitForVideoEnd
- **Forms**: fillForm, extractFormFields, extractQuizQuestions
- **Detection**: detectPageState, checkElement, waitForElement

Example usage:
```typescript
import * as browserTools from '../browser-tools';

const result = await browserTools.click(page, {
  selector: '.next-button',
  waitForNavigation: true,
});
```

### 2. LLM Providers (`src/llm/`)

Unified interface supporting multiple providers:

```typescript
import { LLMFactory, initLLMFactory } from './llm/factory';

const factory = initLLMFactory(config);
const provider = factory.getProviderForTask('orchestrator');

const response = await provider.chat([
  { role: 'system', content: 'You are a helpful assistant' },
  { role: 'user', content: 'What is 2+2?' },
]);
```

### 3. Database (`src/db/`)

SQLite with repositories for:
- **DOMCacheRepository**: Learned selectors with hit count tracking
- **CourseProgressRepository**: Course completion status
- **CourseSectionRepository**: Section-level tracking

```typescript
import { getCourseProgressRepository } from './db/repositories';

const repo = getCourseProgressRepository();
const progress = repo.findByUrl(courseUrl);
```

### 4. Agents (`src/agents/`)

Multi-agent system with specialized behavior:

- **Orchestrator**: Course analysis and sub-agent dispatch
- **VideoHandlerAgent**: Video watching optimization
- **QuizHandlerAgent**: Quiz answering and submission
- **ReaderHandlerAgent**: Content comprehension

### 5. Page Analyzers (`src/analyzers/`)

- **classifyPage()**: Determine page type (video/quiz/reading)
- **extractCourseStructure()**: Parse course TOC
- **detectCompletion()**: Check if section is done

### 6. Profile Manager (`src/profile/`)

Chrome profile management:

```typescript
import { ProfileManager } from './profile/manager';

const pm = new ProfileManager('./data/profiles');
const profiles = pm.listProfiles();
await pm.importProfile('Profile 1', 'agent-profile');
```

## Command Line Interface

```bash
# Complete a course
npm start -- complete "AWS Cloud" "https://coursera.org/learn/aws"

# Options
--headless    Run in headless mode
--debug       Enable debug logging

# Check status
npm start -- status

# View configuration
npm start -- config
```

## Development

### File Structure

```
src/
├── index.ts              # Entry point
├── cli.ts                # CLI interface
├── config/               # Configuration system
├── profile/              # Chrome profile manager
├── browser/              # Playwright controller
├── browser-tools/        # Browser automation tools
├── llm/                  # LLM provider abstraction
├── db/                   # Database & repositories
├── agents/               # Multi-agent system
├── analyzers/            # Page analysis
└── utils/                # Utilities
```

### Building

```bash
# TypeScript compilation
npm run build

# Development watch
npm run dev

# Testing
npm test

# Linting
npm run lint

# Formatting
npm run format
```

### Adding a Custom Agent

1. Create agent file in `src/agents/custom-agent.ts`:

```typescript
import { BaseAgent } from './base-agent.js';

export class CustomAgent extends BaseAgent {
  getTaskType() { return 'custom_type'; }
  getPromptFileName() { return 'custom.md'; }
  async execute(task) { /* implementation */ }
}
```

2. Add prompt file `prompts/custom.md`

3. Register in factory/orchestrator

### Adding a Custom Tool

Tools follow the pattern: `(page: Page, input: ToolInput) => Promise<ToolOutput>`

1. Add to `src/browser-tools/custom.ts`
2. Export from `src/browser-tools/index.ts`
3. Use in agents via `await browserTools.customTool(page, input)`

## Token Optimization

Groq 8K context window allocation:

```
System prompt       ~500 tokens (20%)
Question/Content  ~2000 tokens (25%)     ← extractLLMFriendlyDOM
Instructions        ~500 tokens (6%)
Response buffer    ~2000 tokens (25%)
Safety margin      ~3200 tokens (40%)    ← RESERVE!
                  ─────────────────
Total usable       ~2000-2500 tokens
```

The system aggressively sanitizes HTML to fit within token budgets while preserving semantic meaning.

## Error Handling

- Automatic retries with exponential backoff
- Graceful degradation if features unavailable
- Detailed error logging and reporting
- Database persistence for resumable tasks

## Performance Tips

1. **Use Groq**: Fast, cheap, and fits 8K context
2. **Set `headless: true`** in production
3. **Reduce DOM detail** if hitting token limits
4. **Cache profiles** to avoid re-authentication
5. **Monitor LLM latency** (typically 1-3 seconds per query)

## Troubleshooting

### Chrome not found
- Ensure Chrome is installed: `which google-chrome`
- Close existing Chrome instances before importing profile

### LLM errors
- Check API key in .env
- Verify provider URL in config
- Monitor rate limits (default 60 RPM)

### Database locked
- Ensure previous process exited cleanly
- Delete `.db-wal` file if corrupted

### Low accuracy on quizzes
- Provide more context in system prompt
- Lower temperature for more deterministic answers
- Use better model (gpt-4 vs gpt-3.5)

## Security Notes

- ⚠️ Never commit `.env` with real API keys
- Chrome profiles contain sensitive data (cookies, etc.)
- LLM context may include sensitive course content
- Use headless mode in production

## Future Enhancements

- [ ] MCP server wrapper for integration
- [ ] Parallel section processing
- [ ] Advanced quiz strategy (confidence scoring)
- [ ] Video transcription analysis
- [ ] Course completion certificates
- [ ] Multi-course batching
- [ ] WebSocket API for real-time progress

## License

MIT

## Contributing

Contributions welcome! Please:
1. Follow existing code patterns
2. Add tests for new features
3. Update documentation
4. Keep commits focused

## Support

For issues and questions:
- Check troubleshooting section
- Review logs with `--debug` flag
- Inspect database: `sqlite3 data/agent.db`
