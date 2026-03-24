# Implementation Guide

This document provides detailed setup and implementation notes for the Browser Course Completion Agent.

## Setup Steps

### Step 1: Initial Setup

```bash
# Clone/create project
cd browser-agent

# Install dependencies
npm install

# Create environment file
cp .env.example .env

# Edit .env with your API keys
GROQ_API_KEY=gsk_your_key
# or
OPENAI_API_KEY=sk-your_key
```

### Step 2: Chrome Profile Setup (Optional but Recommended)

If you want to use an existing Chrome session with authentication:

```bash
# Close Chrome completely
# Chrome must be closed when importing profile

# Run profile import (will be added to CLI soon)
# For now, profile will auto-create in data/profiles/agent-profile/
```

### Step 3: First Run

```bash
# Build TypeScript
npm run build

# Try a test run (headless mode recommended for testing)
npm start -- complete "Test Course" "https://example.com/course" --debug --headless
```

## System Modules Explained

### Module 1: Configuration System

**Location**: `src/config/`

- **schema.ts**: Zod validation schemas for all config sections
- **index.ts**: Config loader that merges file + environment variables

**How it works**:
1. Loads `config/default.yaml`
2. Overrides with environment variables (pattern: `AGENT_SECTION_KEY`)
3. Validates everything with Zod schema
4. Returns fully typed Config object

**Usage**:
```typescript
import { loadConfig, getConfig } from '../config';

const config = loadConfig(); // Loads from config/default.yaml + env
const config2 = getConfig(); // Returns cached instance
```

### Module 2: Browser Tools

**Location**: `src/browser-tools/`

All Playwright interactions as pure functions. Each tool file exports functions with consistent signature:

```typescript
// Signature
(page: Page, input: ToolInput) => Promise<ToolOutput<T>>

// Usage
const result = await browserTools.click(page, {
  selector: '.button',
  waitForNavigation: true,
});
```

**Files**:
- `navigation.ts`: Click, type, navigate, scroll, etc.
- `content.ts`: Extract DOM, text, interactive elements
- `video.ts`: Detect and control video playback
- `form.ts`: Fill forms, extract form fields, extract quiz questions
- `detection.ts`: Page state detection, element checking, waiting

**Token Optimization Note**: `extractDOMForLLM()` in content.ts is the key function that:
1. Removes script/style tags, meta tags
2. Collapses excessive whitespace
3. Truncates to target token count
4. Produces ~2-4K tokens from typical web page (~30-50K raw HTML)

### Module 3: LLM Provider Abstraction

**Location**: `src/llm/`

Unified interface for any OpenAI-compatible API:

**Files**:
- `types.ts`: Type definitions
- `provider.ts`: UnifiedLLMProvider (works with Groq, OpenAI, Ollama, etc.)
- `factory.ts`: LLMFactory manages provider instances and selection

**Architecture**:
```
Config (providers section) 
    ↓
LLMFactory.getProviderForTask('orchestrator')
    ↓
UnifiedLLMProvider ← determines which API endpoint based on config
    ↓
OpenAI SDK (works for any compatible API)
```

**Rate Limiting**: Built-in RPM tracking per provider instance

### Module 4: Database

**Location**: `src/db/`

- `index.ts`: Database initialization, schema creation
- `repositories/`: Clean repository pattern for each entity

**Schema Overview**:

1. **dom_cache**: Learned CSS selectors from successful interactions
   - `url_pattern`: Pattern to match URLs
   - `selectors`: JSON of element selectors
   - `hit_count`: Success count (reliability metric)
   - `stale`: Flag if selectors broke recently

2. **course_progress**: Course-level tracking
   - `current_section`: Which section we're on
   - `status`: in_progress, completed, paused, failed
   - `metadata`: Custom JSON storage

3. **course_sections**: Section-level details
   - `page_type`: video, quiz, reading, unknown
   - `status`: pending, in_progress, completed, failed, skipped
   - `attempts`: How many times we tried
   - `error_log`: JSON array of errors encountered

4. **page_snapshots**: Cached DOM for reuse
5. **quiz_history**: Learned quiz answers
6. **progress_indicators**: Time-series progress data

**Repository Usage**:
```typescript
import { getCourseProgressRepository } from '../db/repositories';

const repo = getCourseProgressRepository();
repo.create('Course Name', 'https://...', 10);
repo.updateCurrentSection(courseId, 3);
```

### Module 5: Page Analyzers

**Location**: `src/analyzers/`

`page-classifier.ts`:
- `classifyPage()`: ML-style classification using heuristics
- `extractCourseStructure()`: Parse course table of contents
- `detectCompletion()`: Check if section done

**Classification Strategy**:
1. Look for video elements (HTML5, YouTube, Vimeo)
2. Look for quiz patterns (forms, radio buttons, submit buttons)
3. Look for reading material (text length > 1000 chars)
4. Score each type and return highest confidence

### Module 6: Multi-Agent System

**Location**: `src/agents/`

**Architecture**:

```
BaseAgent (abstract base class)
├─ Orchestrator: Main boss, coordinates everything
├─ VideoHandlerAgent: Specializes in video completion
├─ QuizHandlerAgent: Specializes in quiz answering
└─ ReaderHandlerAgent: Specializes in reading content
```

**Agent Lifecycle**:
1. `execute(task)` called with AgentTask
2. Agent reads task context
3. Agent calls `this.think()` to get LLM guidance (with system prompt)
4. Agent uses browser tools to interact with page
5. Agent returns AgentResult with success status

**System Prompts**: Located in `prompts/*.md`
- Loaded by agent constructor
- Provide behavioral guidelines to LLM
- Can be customized per course/platform

### Module 7: CLI Interface

**Location**: `src/cli.ts`

Main commands:
```bash
# Complete a course
agent complete "Course Name" "https://url"

# Check status
agent status

# Show config
agent config
```

**Initialization Sequence**:
1. Parse CLI arguments
2. Load config (file + env)
3. Initialize logger
4. Initialize database + repositories
5. Initialize LLM factory
6. Create browser controller
7. Run orchestrator agent
8. Cleanup resources

### Module 8: Chrome Profile Manager

**Location**: `src/profile/`

`ProfileManager`:
- `listProfiles()`: List Chrome profiles on system
- `isChromeRunning()`: Check if Chrome process exists
- `importProfile()`: Copy Chrome profile to agent data directory
- `createProfile()`: Create new blank profile
- `getChromeVersion()`: Detect Chrome version

**Use Case**: Import your authenticated Chrome profile to avoid login on course platform

## Common Implementation Patterns

### Pattern 1: Adding a New Sub-Agent

```typescript
// 1. Create agent file
export class CustomAgent extends BaseAgent {
  getTaskType() { return 'custom_type' as const; }
  getPromptFileName() { return 'custom.md'; }

  async execute(task: AgentTask): Promise<AgentResult> {
    const page = this.browser.getActivePage();
    
    // Use tools
    const result = await browserTools.click(page, { selector: '.button' });
    
    // Use LLM
    const guidance = await this.think('What should I do next?');
    
    return { success: true, taskId: task.id, message: 'Done' };
  }
}

// 2. Create prompt file `prompts/custom.md`
// 3. Register in factory/orchestrator
```

### Pattern 2: Adding a New Browser Tool

```typescript
// src/browser-tools/custom.ts
export async function customAction(
  page: Page,
  input: CustomToolInput
): Promise<ToolOutput<CustomResult>> {
  const startTime = Date.now();
  try {
    // Implementation
    return {
      success: true,
      data: { result },
      duration: Date.now() - startTime,
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      duration: Date.now() - startTime,
    };
  }
}

// src/browser-tools/index.ts
export { customAction } from './custom.js';
export { customAction } from './custom.js'; // convenience export
```

### Pattern 3: Database Query

```typescript
const progressRepo = new CourseProgressRepository();

// Create
const progress = progressRepo.create('Course', url, 10);

// Read
const existing = progressRepo.findByUrl(url);

// Update
progressRepo.updateCurrentSection(id, 3);

// Check progress
const percentage = progressRepo.getProgress(id);
```

## Debugging Tips

### Enable Debug Logging

```bash
npm start -- complete "Course" "URL" --debug
```

### Inspect Database

```bash
# View schema
sqlite3 data/agent.db ".schema"

# Query progress
sqlite3 data/agent.db "SELECT * FROM course_progress;"

# Check DOM cache
sqlite3 data/agent.db "SELECT url_pattern, hit_count FROM dom_cache ORDER BY hit_count DESC;"
```

### Monitor LLM Costs

Each LLM call logs:
- Model used
- Input tokens (prompt)
- Output tokens (response)
- Latency

Typical Groq costs:
- 8K context window
- ~0.0002 per 1K input tokens
- ~0.0006 per 1K output tokens
- ≈ $0.01-0.02 per course section

### Browser Debugging

```typescript
// Add debug screenshot
const screenshot = await browserTools.takeScreenshot(page, 'debug.png', true);

// Print actual HTML
const dom = await browserTools.extractDOMForLLM(page, { maxTokens: 10000 });
console.log(dom.data?.html);
```

## Performance Optimization

### 1. Selector Caching

DOM cache learns successful selectors. First run slower, subsequent runs faster.

```typescript
const cached = getDOMCacheRepository().findByUrl(currentUrl);
// Use cached.selectors for faster element finding
```

### 2. Token Budget

Aggressive sanitization keeps context to ~2000 tokens:
```typescript
// Use extractDOMForLLM with strategy='llm-friendly'
const result = await extractDOMForLLM(page, {
  maxTokens: 2000,
  strategy: 'llm-friendly',
});
```

### 3. Video Speed

Set playback to 2x when possible:
```typescript
await controlVideo(page, { action: 'setRate', rate: 2 });
```

### 4. Parallel Section Processing

Currently sequential, but database supports parallel:
```typescript
// Future: process multiple sections concurrently
const sections = repo.findByCourseId(courseId, 'pending');
await Promise.all(sections.map(s => processSection(s)));
```

## Testing Strategy

- Unit tests for utilities (sanitizer, retry, config)
- Integration tests for repositories
- End-to-end tests with real course sites
- Mock browser for agent testing

```bash
npm test
```

## Deployment Considerations

### Production Setup

1. **Use headless mode**: `browser.headless = true`
2. **Set rate limits**: `providers.groq.rateLimitRPM = 60`
3. **Enable logging**: `logging.level = 'warn'`
4. **Persist data**: SQLite backed up regularly
5. **Monitor memory**: Playwright contexts can use 100-200MB

### Scaling

Current system handles 1 course at a time. For multiple:
- Run separate OS processes per course
- Use load balancing for LLM API
- Share database with proper concurrency
- Monitor resource usage

## Troubleshooting Checklist

- [ ] Chrome version compatible (`chrome --version`)
- [ ] API keys configured (check .env)
- [ ] Database writable (check permissions on data/)
- [ ] Course URL accessible
- [ ] LLM response valid JSON when jsonMode used
- [ ] Element selectors match page structure
- [ ] Timeout values appropriate for page load time

## Next Steps

1. **Immediate**: Run first course to test end-to-end
2. **Short-term**: Add custom agents for new course platforms
3. **Medium-term**: Fine-tune LLM prompts based on success rate
4. **Long-term**: Implement parallel processing and API server
