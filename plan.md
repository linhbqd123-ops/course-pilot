# Browser Course Completion Agent — Implementation Plan

> **Mục đích**: Tài liệu chi tiết để coding agent đọc và implement toàn bộ hệ thống.
> **Tech Stack**: Node.js (TypeScript), Playwright, Multi-Agent Orchestration, SQLite (better-sqlite3), OpenAI-compatible LLM providers.

---

## Table of Contents

1. [Tổng quan hệ thống](#1-tổng-quan-hệ-thống)
2. [Cấu trúc thư mục](#2-cấu-trúc-thư-mục)
3. [Module 1 — Chrome Profile Manager](#3-module-1--chrome-profile-manager)
4. [Module 2 — Browser Controller](#4-module-2--browser-controller)
5. [**Module 2.5 — Browser Tools Module**](#25-module-25--browser-tools-module-standalone-playwright-tools) ⭐ **NEW**
6. [Module 3 — LLM Provider Abstraction](#5-module-3--llm-provider-abstraction)
7. [Module 4 — Local Database (SQLite)](#6-module-4--local-database-sqlite)
8. [Module 5 — Multi-Agent Orchestration](#7-module-5--multi-agent-orchestration)
9. [Module 6 — Page Analyzers & Handlers](#8-module-6--page-analyzers--handlers)
10. [Module 7 — CLI Interface](#9-module-7--cli-interface)
11. [Module 8 — Configuration System](#10-module-8--configuration-system)
12. [Luồng hoạt động chính](#11-luồng-hoạt-động-chính)
13. [Chi tiết từng Agent](#12-chi-tiết-từng-agent)
14. [Error Handling & Recovery](#13-error-handling--recovery)
15. [Dependencies](#14-dependencies)
16. [Implementation Order](#15-implementation-order)
17. [Appendix A — Key Design Decisions](#appendix-a-key-design-decisions)
18. [Appendix B — Prompt Templates](#appendix-b-prompt-templates)
19. [Appendix C — Security Notes](#appendix-c-security-notes)
20. [Appendix D — Playwright-MCP vs Direct Playwright](#appendix-d-playwrightmcp-vs-direct-playwright)
21. [**Appendix E — Browser Tools as MCP Server**](#appendix-e-browser-tools-as-mcp-server-future) ⭐ **NEW**
22. [**Appendix F — Browser Tools Testing**](#appendix-f-browser-tools-testing-strategy) ⭐ **NEW**

---

## 1. Tổng quan hệ thống

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLI Interface                           │
│          user chạy: agent complete "Course Name" "URL"          │
└─────────────┬───────────────────────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Orchestrator Agent (Boss)                     │
│  - Nhận task từ CLI                                             │
│  - Phân tích course structure                                   │
│  - Dispatch sub-agents theo loại content                        │
│  - Track progress, retry on failure                             │
└──────┬──────────┬──────────┬──────────┬─────────────────────────┘
       │          │          │          │
       ▼          ▼          ▼          ▼
┌──────────┐┌──────────┐┌──────────┐┌──────────┐
│ Navigator││  Video   ││  Quiz    ││ Reader   │
│  Agent   ││  Agent   ││  Agent   ││  Agent   │
└──────────┘└──────────┘└──────────┘└──────────┘
       │          │          │          │
       ▼          ▼          ▼          ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Browser Controller (Playwright)               │
│              Chrome with dedicated Agent Profile                 │
└─────────────────────────────────────────────────────────────────┘
       │                                          │
       ▼                                          ▼
┌──────────────────┐                   ┌──────────────────────────┐
│  SQLite Local DB │                   │  LLM Provider Layer      │
│  (DOM cache,     │                   │  (Groq, OpenAI, Ollama)  │
│   progress,      │                   │                          │
│   snapshots)     │                   │                          │
└──────────────────┘                   └──────────────────────────┘
```

**Tại sao KHÔNG dùng Playwright-MCP (chi tiết)**: 

1. **Network & Media Control**: Playwright-MCP không support network interception, media event listeners, hoặc video API (YouTube postMessage, Vimeo). Để xử lý video thực tế cần `page.evaluate()` chạy JS trực tiếp → phải dùng Playwright SDK, không MCP.

2. **Token Efficiency Trade-off**: MCP sử dụng accessibility tree (nhỏ hơn full DOM), nhưng vẫn phải:
   - Gửi qua HTTP → serialize/deserialize overhead
   - Accessibility tree cho quiz 50 câu = 5-15K tokens
   - Groq free tier chỉ 8K context → **nguy hiểm token overflow**
   - Direct Playwright: extract DOM trong process, sanitize aggressively (10-20% size), không có HTTP overhead

3. **Feature Gaps**:
   - ❌ Video playback rate control, seek, detect ended
   - ❌ Advanced form interaction (drag-drop, complex widgets)
   - ❌ Init script injection (để bypass anti-bot detection)
   - ❌ Cookie auto-sync qua persistent context
   - ❌ Session persistence detailed control

**Hybrid Approach** (nếu sau này cần scale):
- Core agent: dùng Playwright SDK trực tiếp (Node.js process)
- Nếu muốn expose browser control → wrap bằng MCP layer sau
- Hoặc dùng MCP cho exploratory tasks, Playwright direct cho automation tasks

---

## 2. Cấu trúc thư mục

```
browser-agent/
├── package.json
├── tsconfig.json
├── .env.example                  # Template cho environment variables
├── config/
│   ├── default.yaml              # Config mặc định
│   └── providers.yaml            # LLM provider configs
├── src/
│   ├── index.ts                  # Entry point cho CLI app
│   ├── cli.ts                    # CLI parser (commander)
│   ├── config/
│   │   ├── index.ts              # Config loader (yaml + env merge)
│   │   └── schema.ts             # Zod schema cho config validation
│   ├── profile/
│   │   ├── manager.ts            # Chrome profile create/import/list
│   │   └── types.ts
│   ├── browser/
│   │   ├── context.ts            # Shared context holder (singleton)
│   │   ├── types.ts              # Type definitions
│   │   └── index.ts              # Export all browser tools
│   ├── browser-tools/             # 🌟 STANDALONE PLAYWRIGHT TOOLS
│   │   ├── index.ts              # Export all tools
│   │   ├── navigation.ts         # Tool: navigate, click, type, scroll
│   │   ├── content.ts            # Tool: extract DOM, simplify, classify
│   │   ├── video.ts              # Tool: detect & control video
│   │   ├── form.ts               # Tool: fill forms, extract fields
│   │   ├── interaction.ts        # Tool: wait, hover, screenshot
│   │   ├── detection.ts          # Tool: detect page state, progress
│   │   └── types.ts
│   ├── llm/
│   │   ├── provider.ts           # Abstract LLM provider interface
│   │   ├── groq.ts               # Groq implementation
│   │   ├── openai.ts             # OpenAI-compatible implementation
│   │   ├── ollama.ts             # Ollama implementation
│   │   ├── factory.ts            # Provider factory
│   │   └── types.ts
│   ├── db/
│   │   ├── index.ts              # Database initialization & migrations
│   │   ├── repositories/
│   │   │   ├── dom-cache.ts      # DOM snapshot cache
│   │   │   ├── course-progress.ts # Course completion progress
│   │   │   └── page-patterns.ts  # Learned page patterns
│   │   └── types.ts
│   ├── agents/
│   │   ├── orchestrator.ts       # Boss agent — dispatches tasks
│   │   ├── navigator.ts          # Uses browser-tools for navigation
│   │   ├── video-handler.ts      # Uses browser-tools for video
│   │   ├── quiz-handler.ts       # Uses browser-tools for forms
│   │   ├── reader-handler.ts     # Uses browser-tools for content
│   │   ├── base-agent.ts         # Base class cho tất cả agents
│   │   └── types.ts
│   ├── analyzers/
│   │   ├── page-classifier.ts    # Classify page type (video/quiz/read/...)
│   │   ├── course-structure.ts   # Parse course TOC/syllabus
│   │   └── completion-detector.ts # Detect if section is complete
│   └── utils/
│       ├── logger.ts             # Structured logging (pino)
│       ├── retry.ts              # Retry utilities
│       └── html-sanitizer.ts     # Sanitize HTML for LLM context
├── data/
│   ├── profiles/                 # Chrome profiles stored here
│   └── agent.db                  # SQLite database file
├── prompts/
│   ├── orchestrator.md           # System prompt cho orchestrator
│   ├── navigator.md              # System prompt cho navigator
│   ├── video-handler.md          # System prompt cho video handler
│   ├── quiz-handler.md           # System prompt cho quiz handler
│   ├── reader-handler.md         # System prompt cho reader handler
│   └── page-classifier.md        # System prompt cho page classifier
├── mcp-bridge/                   # 🌟 MCP SERVER WRAPPER (future)
│   ├── server.ts                 # MCP server entrypoint
│   ├── tool-adapter.ts           # Adapter: browser-tools → MCP tools
│   └── README.md                 # How to run as MCP server
└── tests/
    ├── profile.test.ts
    ├── browser.test.ts
    ├── browser-tools.test.ts
    ├── llm.test.ts
    └── agents.test.ts
```

---

## 3. Module 1 — Chrome Profile Manager

### 3.1 Mục tiêu
- Tạo một Chrome profile riêng cho agent
- Import toàn bộ user data từ một Chrome profile có sẵn (cookies, sessions, localStorage, extensions)
- Sau lần đầu, chỉ dùng lại profile agent này

### 3.2 Implementation Details

**File: `src/profile/manager.ts`**

```typescript
export class ProfileManager {
  private profilesDir: string; // data/profiles/

  // Liệt kê tất cả Chrome profiles có sẵn trên máy user
  async listChromeProfiles(): Promise<ChromeProfile[]>;

  // Tạo agent profile mới bằng cách copy từ source profile
  async createAgentProfile(sourceProfileName: string): Promise<string>;

  // Kiểm tra agent profile đã tồn tại chưa
  async hasAgentProfile(): Promise<boolean>;

  // Lấy path đến agent profile
  getAgentProfilePath(): string;

  // Cập nhật/re-sync từ source profile (nếu session hết hạn)
  async resyncProfile(sourceProfileName: string): Promise<void>;
}
```

### 3.3 Chrome Profile Locations

```typescript
// Windows
const CHROME_USER_DATA = path.join(process.env.LOCALAPPDATA!, 'Google', 'Chrome', 'User Data');

// macOS
const CHROME_USER_DATA = path.join(os.homedir(), 'Library', 'Application Support', 'Google', 'Chrome');

// Linux
const CHROME_USER_DATA = path.join(os.homedir(), '.config', 'google-chrome');
```

### 3.4 Quy trình import profile

1. Đọc `${CHROME_USER_DATA}/Local State` → parse JSON → lấy `profile.info_cache` để list profiles
2. User chọn profile qua CLI (interactive prompt với `inquirer`)
3. Copy toàn bộ folder profile (vd: `Profile 1`) vào `data/profiles/agent-profile/`
4. Copy thêm các file cần thiết:
   - `Cookies` (SQLite file)
   - `Login Data` (nếu cần)
   - `Local Storage/`
   - `Session Storage/`
   - `IndexedDB/`
   - `Extension*` folders
   - `Preferences`, `Secure Preferences`
5. **KHÔNG copy**: `Cache/`, `Code Cache/`, `GPUCache/` (quá lớn, không cần)
6. Lưu metadata vào `data/profiles/profile-meta.json`:
   ```json
   {
     "sourceProfile": "Profile 1",
     "sourceName": "Nguyễn Văn A",
     "createdAt": "2026-03-24T...",
     "lastSynced": "2026-03-24T..."
   }
   ```

### 3.5 Lưu ý quan trọng
- Chrome phải ĐÓNG hoàn toàn trước khi copy profile (file lock)
- Kiểm tra Chrome process bằng `tasklist` (Windows) / `pgrep` (Linux/Mac)
- Nếu Chrome đang chạy → thông báo user đóng Chrome trước
- Profile agent sẽ dùng Playwright `launchPersistentContext` (KHÔNG PHẢI `launch`)

---

## 4. Module 2 — Browser Controller

### 4.1 Mục tiêu
- Quản lý lifecycle của Chrome browser bằng Playwright
- Dùng persistent context với agent profile
- Cung cấp high-level API cho các agents

### 4.2 Implementation Details

**File: `src/browser/controller.ts`**

```typescript
import { chromium, BrowserContext, Page } from 'playwright';

export class BrowserController {
  private context: BrowserContext | null = null;
  private activePage: Page | null = null;

  // Launch Chrome với agent profile
  async launch(): Promise<void> {
    const profilePath = profileManager.getAgentProfilePath();
    this.context = await chromium.launchPersistentContext(profilePath, {
      headless: false,           // Cần thấy browser để debug
      channel: 'chrome',         // Dùng Chrome thật (không phải Chromium)
      viewport: { width: 1920, height: 1080 },
      args: [
        '--disable-blink-features=AutomationControlled',
        '--disable-infobars',
      ],
      ignoreDefaultArgs: ['--enable-automation'],
    });
  }

  // Navigate đến URL
  async navigateTo(url: string): Promise<Page>;

  // Lấy page hiện tại
  getActivePage(): Page;

  // Chụp screenshot (cho debug/LLM vision)
  async screenshot(): Promise<Buffer>;

  // Lấy DOM đã sanitize (loại bỏ script, style, chỉ giữ meaningful content)
  async getPageContent(): Promise<string>;

  // Lấy simplified DOM tree cho LLM
  async getAccessibilityTree(): Promise<string>;

  // Execute JS trên page
  async evaluate<T>(fn: string | Function): Promise<T>;

  // Wait cho selector
  async waitForSelector(selector: string, timeout?: number): Promise<void>;

  // Click element
  async click(selector: string): Promise<void>;

  // Type text
  async type(selector: string, text: string): Promise<void>;

  // Scroll
  async scroll(direction: 'up' | 'down', amount?: number): Promise<void>;

  // Close browser
  async close(): Promise<void>;
}
```

### 4.3 Page Utilities

**File: `src/browser/page-utils.ts`**

```typescript
// Trích xuất simplified DOM — loại bỏ noise, giữ lại interactive elements
export async function extractSimplifiedDOM(page: Page): Promise<string> {
  return page.evaluate(() => {
    // Loại bỏ: script, style, svg, noscript, link, meta
    // Giữ lại: buttons, links, inputs, headings, paragraphs, video, iframe
    // Thêm data attributes: data-agent-id="el-{index}" cho mỗi interactive element
    // Return HTML string đã simplify
  });
}

// 🔥 Token-efficient DOM extraction — sanitize for LLM consumption
export async function extractLLMFriendlyDOM(page: Page, options?: {
  maxTokens?: number;      // Estimate target token count (default: 3000)
  includeText?: boolean;   // Include text content (default: true)
  includeAttributes?: string[]; // Whitelist attributes to keep
}): Promise<{
  html: string;
  truncated: boolean;
  estimatedTokens: number;
}> {
  // Strategy:
  // 1. Extract visible text content + interactive elements ONLY
  // 2. Remove: comments, data URLs, base64, long text (>500 chars)
  // 3. Preserve: form labels, button text, alt text
  // 4. Flatten nested structures → removes 40-60% token size
  // 5. Keep interactive element selectors (for clicking)
  // 6. If size > maxTokens: truncate + mark as truncated
  // 
  // Example output:
  // <main>
  //   <h1>Quiz</h1>
  //   <form>
  //     <div data-agent-id="q1">
  //       Q1: What is X?
  //       <input type="radio" name="q1" value="a"/> A. Answer A
  //       <input type="radio" name="q1" value="b"/> B. Answer B
  //     </div>
  //     <button data-agent-id="btn-submit">Submit</button>
  //   </form>
  // </main>
}

// Đánh dấu tất cả interactive elements bằng visual overlay (cho screenshot)
export async function markInteractiveElements(page: Page): Promise<ElementMap>;

// Detect video player trên page
export async function detectVideoPlayer(page: Page): Promise<VideoPlayerInfo | null>;

// Detect form/quiz elements
export async function detectQuizElements(page: Page): Promise<QuizInfo | null>;
```

**Token Optimization Notes**:
- **Full HTML** của trang complex = 30-50K tokens
- **Cleaned accessibility tree** = 5-15K tokens
- **LLMFriendlyDOM** (aggressive sanitize) = **2-4K tokens** ✅
- **Groq 8K context window** → với LLMFriendlyDOM + system prompt + task = vừa vặn
- **Strategy**: Sacrifice detailed DOM structure để fit context, dùng cached selectors để compensate

---

## 2.5 Module 2.5 — Browser Tools Module (Standalone Playwright Tools)

### 2.5.0 Tại sao tách thành tools module riêng?

**Problem**: Nếu để Playwright logic trong agents, sẽ tight coupling → khó reuse, khó test, khó port sang MCP.

**Solution**: Extract **tất cả Playwright interactions** thành **independent tool functions** trong `browser-tools/` module. 

**Benefits**:
- ✅ Agents chỉ gọi tools, không care Playwright implementation
- ✅ Dễ testing (mock tools cho agents)
- ✅ Dễ port sang MCP server (thin adapter layer)
- ✅ Dễ update Playwright version (chỉ update tools)
- ✅ Reuse tools cho CLI commands, scripts, etc.

### 2.5.1 Design Pattern: Function-based Tools

Mỗi tool là pure function: `(page: Page, input: ToolInput) => Promise<ToolOutput>`

**File: `src/browser-tools/types.ts`**

```typescript
// Shared types cho tất cả tools
export interface ToolInput {
  timeout?: number;
  retries?: number;
  screenshot?: boolean; // Auto-capture on error
}

export interface ToolOutput<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  duration: number; // Ms to execute
  screenshot?: Buffer; // If requested or error occurred
}

// Specific tool inputs/outputs
export interface ClickToolInput extends ToolInput {
  selector: string;
  waitFor?: string; // Wait for selector after click
  scrollIntoView?: boolean;
}

export interface ExtractDOMToolInput extends ToolInput {
  maxTokens?: number; // For LLM-friendly output
  includeText?: boolean;
  includeInteractive?: boolean;
}

export interface FillFormToolInput extends ToolInput {
  fields: Array<{
    selector: string;
    value: string;
    type?: 'text' | 'select' | 'checkbox' | 'radio';
  }>;
  submitSelector?: string; // Auto-submit after fill
  waitForNavigation?: boolean;
}

export interface DetectVideoToolInput extends ToolInput {
  screenshot?: boolean;
}

export interface VideoControlToolInput extends ToolInput {
  action: 'play' | 'pause' | 'setRate' | 'seek' | 'getState';
  rate?: number; // For setRate
  seconds?: number; // For seek
  waitForEnd?: boolean; // For play action
  pollInterval?: number; // Check state every Xms
}
```

### 2.5.2 Tool Modules Signatures (Implementation by Coding Agent)

**File: `src/browser-tools/navigation.ts`** — Function signatures only:
- `navigateTo(page, url, input)` → `Promise<ToolOutput<{url, title}>>`
- `click(page, input: ClickToolInput)` → `Promise<ToolOutput<{clicked, newUrl}>>`
- `type(page, selector, text, input)` → `Promise<ToolOutput<{typed}>>`
- `scroll(page, direction, amount, input)` → `Promise<ToolOutput<{scrolled}>>`

**File: `src/browser-tools/content.ts`**:
- `extractDOMForLLM(page, input: ExtractDOMToolInput)` → `Promise<ToolOutput<{html, truncated, estimatedTokens}>>`
  - Priority: Aggressive sanitization to fit Groq 8K (target 2-4K tokens)
- `getTextContent(page, input)` → `Promise<ToolOutput<{text}>>`

**File: `src/browser-tools/video.ts`**:
- `detectVideo(page, input: DetectVideoToolInput)` → `Promise<ToolOutput<{found, type, selector, duration, currentTime}>>`
- `controlVideo(page, input: VideoControlToolInput)` → `Promise<ToolOutput<{action, state}>>`

**File: `src/browser-tools/form.ts`**:
- `fillForm(page, input: FillFormToolInput)` → `Promise<ToolOutput<{filled, errors}>>`
- `extractFormFields(page, input)` → `Promise<ToolOutput<{fields}>>`

**File: `src/browser-tools/detection.ts`**:
- `detectPageState(page, input)` → `Promise<ToolOutput<{hasQuiz, hasVideo, hasNavigation, hasCompletionMessage, estimatedPageType}>>`
- `checkElement(page, selector, input)` → `Promise<ToolOutput<{exists, visible, enabled}>>`
- `waitForState(page, selector, state, input)` → `Promise<ToolOutput<{reached}>>`

### 2.5.3 Tool Exports & Agent Usage

**File: `src/browser-tools/index.ts`**

```typescript
export * from './types';
export * as navigation from './navigation';
export * as content from './content';
export * as video from './video';
export * as form from './form';
export * as detection from './detection';

// Re-export commonly used tools for convenience
export {
  navigateTo,
  click,
  type,
  scroll,
} from './navigation';
export {
  extractDOMForLLM,
  getTextContent,
} from './content';
export {
  detectVideo,
  controlVideo,
} from './video';
export {
  fillForm,
  extractFormFields,
} from './form';
export {
  detectPageState,
  checkElement,
  waitForState,
} from './detection';
```

**Agent Usage Pattern**:

```typescript
// Inside VideoHandlerAgent.execute()
import * as browserTools from '../browser-tools';

async execute(task: AgentTask): Promise<AgentResult> {
  const page = this.browser.getActivePage();

  // Tool 1: Detect video
  const detectResult = await browserTools.video.detectVideo(page, {
    screenshot: true
  });
  if (!detectResult.success) {
    return { success: false, error: detectResult.error };
  }

  // Tool 2: Control video (play + wait for end)
  const playResult = await browserTools.video.controlVideo(page, {
    action: 'play',
    waitForEnd: true,
    pollInterval: 5000
  });

  // Tool 3: Wait for next button
  await browserTools.detection.waitForState(page, '.btn-next', 'visible');

  // Tool 4: Click next
  const clickResult = await browserTools.navigation.click(page, {
    selector: '.btn-next'
  });

  return { success: true, action: 'Video completed' };
}
```

### 2.5.4 Future: MCP Server Adapter

**File: `mcp-bridge/tool-adapter.ts`** (future port)

```typescript
import * as browserTools from '../src/browser-tools';

// Adapter: Convert browser-tools to MCP tools
export function adaptTool(toolName: string, toolFn: Function) {
  return {
    name: toolName,
    description: `Execute ${toolName} on the browser`,
    inputSchema: {
      type: 'object',
      properties: {
        // Auto-generate from tool's TypeScript signature
      },
    },
    handler: async (input: any) => {
      const result = await toolFn(input);
      return {
        success: result.success,
        content: [{ type: 'text', text: JSON.stringify(result.data) }],
      };
    },
  };
}

// Export all tools as MCP tools
export const mcpTools = {
  navigate_to: adaptTool('navigateTo', browserTools.navigateTo),
  click: adaptTool('click', browserTools.click),
  fill_form: adaptTool('fillForm', browserTools.fillForm),
  detect_video: adaptTool('detectVideo', browserTools.video.detectVideo),
  // ... more
};
```

### 2.5.5 Agent ↔ Tool Interaction Pattern

**Flow: Orchestrator → Sub-Agent → Browser Tools → Playwright → Browser**

```
Orchestrator Agent
  ├─ Think: "Current page is QUIZ"
  │
  ├─ Dispatch: QuizHandlerAgent.execute(task)
  │
  └─ QuizHandlerAgent
      ├─ Tool: detection.detectPageState() → { hasQuiz: true, ... }
      ├─ Tool: content.extractDOMForLLM() → { html: "...", tokens: 2800 }
      │
      ├─ Think (LLM): "Question 1: Q text... Options: A, B, C"
      │  → LLM response: "Select B"
      │
      ├─ Tool: form.extractFormFields() → [ { selector, name, type } ]
      ├─ Tool: form.fillForm({ fields: [{selector, value: "B"}] })
      ├─ Tool: form.fillForm({ submitSelector: ".btn-submit" })
      │
      ├─ Tool: detection.waitForState(".result", "visible")
      ├─ Tool: content.extractDOMForLLM() → parse score
      │
      └─ Return: { success: true, action: "Quiz completed" }
```

**Key Principles**:

1. **Agents = Orchestration Logic** (LLM-driven decision-making)
2. **Tools = Playwright Primitives** (pure functions, no side effects except browser)
3. **Decoupling**: Agents don't import Playwright, only tools do
4. **Testability**: Mock tools when testing agents
5. **Reusability**: Tools can be called by CLI, scripts, other agents

**Example: QuizHandlerAgent**(simplified)

```typescript
import { BaseAgent } from './base-agent';
import * as browserTools from '../browser-tools';

export class QuizHandlerAgent extends BaseAgent {
  async execute(task: AgentTask): Promise<AgentResult> {
    const page = this.browser.getActivePage();

    // 1. Detect quiz
    const detectResult = await browserTools.detection.detectPageState(page);
    if (!detectResult.data?.hasQuiz) {
      return { success: false, error: 'Not a quiz page' };
    }

    // 2. Extract quiz DOM
    const domResult = await browserTools.content.extractDOMForLLM(page, {
      maxTokens: 2500,
    });
    if (!domResult.success) {
      return { success: false, error: domResult.error };
    }

    // 3. Ask LLM to analyze and answer
    const userMessage = `
Here's a quiz page. Extract all questions and suggest answers.
Respond with JSON.

${domResult.data?.html}
    `;

    let quizAnswers;
    try {
      quizAnswers = await this.thinkJSON(userMessage);
    } catch (error) {
      return { success: false, error: String(error) };
    }

    // 4. Fill and submit
    const fillResult = await browserTools.form.fillForm(page, {
      fields: quizAnswers.fields,
      submitSelector: quizAnswers.submitSelector,
      waitForNavigation: false,
    });
    if (!fillResult.success) {
      return { success: false, error: fillResult.error };
    }

    // 5. Wait for result
    await browserTools.detection.waitForState(page, '.quiz-result', 'visible',
      { timeout: 30000 }
    );

    // 6. Parse and return
    return {
      success: true,
      action: 'Quiz completed and submitted',
      data: { answeredQuestions: quizAnswers.count },
    };
  }
}
```

**Comparison: Without Browser Tools Module** ❌

```typescript
// BAD: Playwright logic mixed in agent
export class QuizHandlerAgent {
  async execute(task) {
    const page = this.page;
    
    // Tightly coupled Playwright code
    const html = await page.evaluate(() => {
      // ... 50 lines of DOM sanitization
    });
    
    await page.click('.form input[type="radio"][value="b"]');
    await page.click('.submit');
    
    // Hard to test, hard to reuse, hard to wrap in MCP
  }
}
```

**With Browser Tools Module** ✅

```typescript
// GOOD: Clean separation
export class QuizHandlerAgent {
  async execute(task) {
    const page = this.page;
    
    // 1-line tool calls
    const domResult = await browserTools.content.extractDOMForLLM(page);
    const fillResult = await browserTools.form.fillForm(page, { fields });
    
    // Easy to test (mock tools), easy to reuse, easy to wrap in MCP
  }
}
```

---

## 5. Module 3 — LLM Provider Abstraction

### 5.1 Mục tiêu
- Hỗ trợ nhiều LLM providers: Groq, OpenAI, Ollama, bất kỳ OpenAI-compatible API
- Mỗi task/agent có thể config dùng provider & model riêng
- Switch provider dễ dàng qua config

### 5.2 Interface

**File: `src/llm/types.ts`**

```typescript
export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | LLMContentPart[];
}

export interface LLMContentPart {
  type: 'text' | 'image_url';
  text?: string;
  image_url?: { url: string; detail?: 'low' | 'high' | 'auto' };
}

export interface LLMResponse {
  content: string;
  usage: { prompt_tokens: number; completion_tokens: number };
  model: string;
}

export interface LLMProviderConfig {
  name: string;           // "groq" | "openai" | "ollama" | "custom"
  baseUrl: string;        // API base URL
  apiKey: string;         // API key (empty for Ollama)
  defaultModel: string;   // Model mặc định
  maxTokens?: number;
  temperature?: number;
  rateLimitRPM?: number;  // Rate limit requests per minute
}

export interface LLMProvider {
  readonly name: string;
  chat(messages: LLMMessage[], options?: ChatOptions): Promise<LLMResponse>;
  // Vision support check
  supportsVision(): boolean;
}

export interface ChatOptions {
  model?: string;         // Override default model
  temperature?: number;
  maxTokens?: number;
  jsonMode?: boolean;     // Force JSON output
}
```

### 5.3 Provider Implementations

**Tất cả providers đều gọi qua OpenAI SDK** vì Groq, Ollama, và hầu hết providers đều compatible.

**File: `src/llm/provider.ts`**

```typescript
import OpenAI from 'openai';

export class UnifiedLLMProvider implements LLMProvider {
  private client: OpenAI;
  private config: LLMProviderConfig;
  private rateLimiter: RateLimiter;

  constructor(config: LLMProviderConfig) {
    this.config = config;
    this.client = new OpenAI({
      apiKey: config.apiKey || 'not-needed',  // Ollama không cần key
      baseURL: config.baseUrl,
    });
    this.rateLimiter = new RateLimiter(config.rateLimitRPM || 30);
  }

  async chat(messages: LLMMessage[], options?: ChatOptions): Promise<LLMResponse> {
    await this.rateLimiter.acquire();

    const response = await this.client.chat.completions.create({
      model: options?.model || this.config.defaultModel,
      messages: messages as any,
      temperature: options?.temperature ?? this.config.temperature ?? 0.3,
      max_tokens: options?.maxTokens ?? this.config.maxTokens ?? 4096,
      ...(options?.jsonMode ? { response_format: { type: 'json_object' } } : {}),
    });

    return {
      content: response.choices[0].message.content || '',
      usage: {
        prompt_tokens: response.usage?.prompt_tokens || 0,
        completion_tokens: response.usage?.completion_tokens || 0,
      },
      model: response.model,
    };
  }

  supportsVision(): boolean {
    // Groq: llama-3.2-90b-vision, etc.
    // OpenAI: gpt-4o, gpt-4-vision
    // Ollama: llava, bakllava
    const visionModels = ['vision', 'gpt-4o', 'llava', 'bakllava', 'gemma3'];
    return visionModels.some(v => this.config.defaultModel.includes(v));
  }
}
```

### 5.4 Provider Factory

**File: `src/llm/factory.ts`**

```typescript
export class LLMFactory {
  private providers: Map<string, LLMProvider> = new Map();

  // Tạo provider từ config
  createProvider(config: LLMProviderConfig): LLMProvider;

  // Lấy provider theo tên
  getProvider(name: string): LLMProvider;

  // Lấy provider cho task cụ thể (tra config)
  getProviderForTask(taskType: AgentTaskType): LLMProvider;
}
```

### 5.5 Preset Configs

```yaml
# config/providers.yaml
providers:
  groq:
    baseUrl: "https://api.groq.com/openai/v1"
    apiKey: "${GROQ_API_KEY}"        # Đọc từ env
    defaultModel: "llama-3.3-70b-versatile"
    contextWindow: 8192              # ⚠️ CRITICAL: 8K token limit
    rateLimitRPM: 30
    temperature: 0.2
    # ⚠️ Warning: Free tier models have aggressive context limits
    # Recommend using extractLLMFriendlyDOM() to fit within 3K actual content

  openai:
    baseUrl: "https://api.openai.com/v1"
    apiKey: "${OPENAI_API_KEY}"
    defaultModel: "gpt-4o-mini"
    contextWindow: 128000            # ✅ Generous, but paid tier
    rateLimitRPM: 60

  ollama:
    baseUrl: "http://localhost:11434/v1"
    apiKey: ""
    defaultModel: "llama3.1:8b"
    contextWindow: 8192              # Local, no cost, but slower
    rateLimitRPM: 0              # No rate limit for local

  # User có thể thêm custom provider (vd: vLLM, LM Studio)
  custom:
    baseUrl: "${CUSTOM_LLM_BASE_URL}"
    apiKey: "${CUSTOM_LLM_API_KEY}"
    defaultModel: "${CUSTOM_LLM_MODEL}"
    contextWindow: 8192              # Default, override as needed

# Mapping task → provider + model override
taskMapping:
  orchestrator:
    provider: "groq"                 # Orchestrator queries: ~2-3K tokens max
    model: "llama-3.3-70b-versatile"
    maxContextUsage: 0.8             # Don't exceed 80% of context window
  
  navigator:
    provider: "groq"
    model: "llama-3.1-8b-instant"    # Small model sufficient for navigation
    maxContextUsage: 0.7
  
  pageClassifier:
    provider: "groq"
    model: "llama-3.1-8b-instant"
    maxContextUsage: 0.6             # Aggressive since it's just classification
  
  videoHandler:
    provider: "groq"
    model: "llama-3.1-8b-instant"    # Minimal LLM usage for video
    maxContextUsage: 0.5
  
  quizHandler:
    provider: "groq"
    model: "llama-3.3-70b-versatile"    # Need stronger reasoning for Q&A
    maxContextUsage: 0.9             # Quiz content can be complex
    fallback: "ollama"               # If Groq fails, use local Ollama
  
  readerHandler:
    provider: "groq"
    model: "llama-3.3-70b-versatile"    # Need to understand course content
    maxContextUsage: 0.85
```

**Token Budget Strategy**:
```
Groq 8K context window allocation:
├── System prompt               ~500 tokens (20%)
├── Question/Content           ~2000 tokens (25%)      ← extractLLMFriendlyDOM
├── Instructions               ~500 tokens (6%)
├── Response buffer            ~2000 tokens (25%)
├── Safety margin (40%)        ~3200 tokens (40%)      ← MUST reserve!
└── TOTAL USABLE              ~2000-2500 tokens       ← MAX actual content
```

⚠️ **CRITICAL**: Implement context window validation in `think()` method — warn when approaching 75% limit

---

## 6. Module 4 — Local Database (SQLite)

### 6.1 Tại sao SQLite thay vì in-memory
- Persist qua các lần chạy (resume course nếu bị dừng giữa chừng)
- DOM cache có thể lớn, không nên giữ hết trong memory
- Query linh hoạt hơn Map/Object
- File đơn lẻ, không cần server

### 6.2 Schema

**File: `src/db/index.ts`** — SQL to implement:

**Tables**: 
- `dom_cache` — Store learned selectors per URL pattern, with hit_count for reliability
- `course_progress` — Track course status, started_at, completed_at, current section
- `course_sections` — Each section with page_type, status, attempts, error_log
- `page_snapshots` — Store simplified DOM for analysis
- `quiz_history` — Cache quiz Q&A (question_text, options, selected_answer, is_correct)

**Indexes**: url_pattern, course_url, course_id, section_id for fast queries

### 6.3 Repository Pattern — Implement for each table:

Each repository should have methods like:
- `findByUrl(pattern)` → query DB, return typed object or null
- `upsert(entry)` → insert or replace
- `incrementHitCount(id)` → UPDATE hit_count++
- `markComplete(id)` → UPDATE status

Follow this pattern for: `DOMCacheRepository`, `CourseProgressRepository`, `CourseSection Repository`, `QuizHistoryRepository`

### 6.4 DOM Cache Lookup & Validation Strategy

**Problem**: How to find cached DOM for a new page? Need staleness detection and auto-update?

**Solution: NO RAG NEEDED** — Simple URL-based matching with selector validation:

#### A. Cache Lookup (at start of each page)

```
1. Extract current URL + domain
2. Query DOM cache by URL pattern (simple string match OR regex)
3. Priority order:
   a. Exact domain + path pattern match → highest priority
   b. Regex pattern match (e.g., "coursera.org/learn/*")
   c. Fuzzy domain match (just "coursera.org")
4. If multiple matches → sort by hit_count (most reliable first)
5. Return top 1-3 cached entries
```

**Implementation**: DOMCacheRepository.findByUrl(url) —
- Query: `SELECT * FROM dom_cache WHERE url_pattern LIKE '%domain%' ORDER BY hit_count DESC`
- Fuzzy match with score, filter top N
- Return with selectors sorted by hit_count

**NO RAG**: Just string matching + DB query. Fast, simple, no LLM overhead.

#### B. Selector Validation & Recovery

```
When agent needs to click/type/scroll:

1. Try cached selector first
   → browserTools.click(page, {selector: cachedSelector})
   → If success → increment hit_count, done ✓

2. If fails (element not found):
   a. Log failure: "Selector .btn-next failed on https://..."
   b. Mark in DB: UPDATE dom_cache SET stale = 1 WHERE id = ?
   c. Re-scan page: fresh DOM extraction
   d. Ask LLM to find alternative selectors
   
3. Found new selectors:
   a. Test them on current page
   b. If work → update cache entry
   c. Or create NEW cache entry if pattern different

4. Return success/failure to agent
```

**Implementation**: Add to `browserTools.click()`:
```
try {
  await page.click(input.selector)  // Try cached first
  db.domCache.incrementHitCount(cacheId)  // Success → increment
} catch {
  db.domCache.markStale(cacheId)  // Mark for review
  // Fallback: LLM finds new selector
}
```

#### C. Automatic DOM Update (when stale detected)

**Trigger**: When selector fails 3+ times in a session

```
1. Extract fresh DOM from page
2. Compare with cached DOM (hash/signature check)
3. If different:
   a. Extract new selectors via LLM or heuristics
   b. Create or update cache entry
   c. Set version timestamp
   d. Reset stale flag
   
4. Learn & persist:
   - Store new_selectors + old_selectors comparison
   - Track which selectors broke (for pattern analysis)
   - Update hit_count for successful new selectors
```

**Implementation**: New method in `src/analyzers/dom-extractor.ts`:
```typescript
async function detectSelectorChanges(
  page: Page,
  cachedSelectors: Record<string, string>
): Promise<{
  changed: boolean;
  newSelectors: Record<string, string>;
  failedSelectors: string[];
}> {
  // Test each cached selector
  // If fails → find new one OR mark as unavailable
  // Compare vs cached ones
  // Return: what changed
}
```

**Update in DB**:
```typescript
if (selectorChanges.changed) {
  db.domCache.update(cacheId, {
    selectors: selectorChanges.newSelectors,
    stale: 0,
    last_seen_at: new Date().toISOString(),
    metadata: {
      previous_selectors: old.selectors,
      failure_count: old.failure_count || 0,
    }
  });
}
```

#### D. Cache Freshness & Versioning

**Schema extension** (in dom_cache table):
```
- version: INT (increment when selectors change)
- stale: BOOL (1 = known to fail, needs re-check)
- last_validated_at: DATETIME (when was this last tested successfully)
- failure_count: INT (how many times failed recently)
```

**Validation before use**:
```typescript
function shouldUseCachedSelector(cacheEntry): boolean {
  if (cacheEntry.stale) return false;  // Skip obviously bad ones
  
  const age = Date.now() - cacheEntry.last_validated_at;
  const maxAge = 24 * 60 * 60 * 1000;  // 24 hours
  if (age > maxAge) return false;      // Too old, re-validate
  
  return true;
}
```

#### E. Example Flow

```
Page: https://coursera.org/learn/aws-basics/lecture/section-1

1. Load cache for "coursera.org/learn/*"
   → Found: {"nextBtn": ".btn-next", "videoPlayer": "#player", hit_count: 45}

2. Use cached selectors:
   → await browserTools.click(page, {selector: ".btn-next"})
   ✓ Success → db.domCache.incrementHitCount(cacheId) [now 46]

3. Next page: https://coursera.org/learn/aws-basics/lecture/section-2
   → Same cache entry applies (same pattern)
   → Try .btn-next again → ✓ Works, increment [now 47]

4. On new section with different layout:
   → Try .btn-next → ✗ FAILS (not found)
   → Trigger fresh extraction
   → Found: ".button.primary" instead
   → Update cache: {"nextBtn": ".button.primary", ...}
   → Mark old as previous version
   → Next attempt will use new selector

5. If fails AGAIN after update:
   → Mark as stale
   → Ask LLM for help
   → Manual check required
```

---

## 7. Module 5 — Multi-Agent Orchestration

### 7.1 Architecture

Hệ thống dùng **Hierarchical Orchestration Pattern**:
- **Orchestrator** (Boss Agent) — quyết định strategy, dispatch sub-agents
- **Sub-Agents** — mỗi agent chuyên biệt cho 1 loại task, nhận lệnh từ Orchestrator

**Communication**: Agents giao tiếp qua message objects (không phải event bus hay pubsub). Orchestrator gọi sub-agent synchronously, nhận result, rồi quyết định bước tiếp.

### 7.2 Base Agent

**File: `src/agents/base-agent.ts`** — Base class with:

**Constructor**:
- Inject dependencies: `llmFactory`, `browser`, `db`, `logger`
- Resolve provider for task type from config
- Load system prompt from `prompts/{agent-name}.md`

**Abstract methods** (implement in sub-agents):
- `getTaskType(): AgentTaskType`
- `getPromptFile(): string`
- `execute(task: AgentTask): Promise<AgentResult>`

**Protected helper methods** (implement):
- `think(message, options?)`: Call LLM with system prompt
- `thinkJSON<T>(message)`: Call LLM with jsonMode and parse response
- `getPageContext()`: Extract DOM + load from cache + format for LLM

**Key pattern**: Agents call `this.think()` only, never LLM directly. All Playwright via tools.

### 7.3 Agent Communication Protocol

```typescript
// Task được gửi từ Orchestrator đến sub-agent
export interface AgentTask {
  id: string;
  type: 'navigate' | 'watch_video' | 'answer_quiz' | 'read_content' | 'analyze_page';
  context: {
    courseId: number;
    sectionId?: number;
    url?: string;
    instructions?: string;    // Hướng dẫn cụ thể từ orchestrator
    metadata?: Record<string, any>;
  };
}

// Result trả về từ sub-agent
export interface AgentResult {
  success: boolean;
  action: string;             // Mô tả action đã thực hiện
  nextAction?: string;        // Suggest next action cho orchestrator
  data?: Record<string, any>; // Data thu thập được
  error?: string;
  learnedSelectors?: Record<string, string>; // Selectors mới học được
}
```

---

## 8. Module 6 — Page Analyzers & Handlers

### 8.1 Page Classifier

**File: `src/analyzers/page-classifier.ts`**

Phân loại trang hiện tại thuộc loại gì:

```typescript
export enum PageType {
  VIDEO = 'video',           // Trang có video player cần xem
  QUIZ = 'quiz',             // Trang có quiz/test cần trả lời
  READING = 'reading',       // Trang đọc nội dung, có thể có interaction
  NAVIGATION = 'navigation', // Trang menu/TOC chọn sections
  COMPLETION = 'completion', // Trang thông báo hoàn thành
  EXTERNAL = 'external',     // Trang bên ngoài course
  UNKNOWN = 'unknown',
}

export class PageClassifier {
  // Phân loại bằng heuristic trước (nhanh, không tốn LLM)
  async classifyByHeuristic(page: Page): Promise<PageType | null> {
    // Check video elements: <video>, <iframe src="youtube|vimeo|...">, .video-player
    // Check quiz elements: <form> with <input type="radio|checkbox">, .quiz, .assessment
    // Check navigation: .syllabus, .module-list, .table-of-contents
    // Check completion: .completion-message, .certificate, text "Congratulations"
  }

  // Fallback: dùng LLM nếu heuristic không chắc chắn
  async classifyByLLM(simplifiedDOM: string): Promise<PageType> {
    // Gửi DOM cho LLM, yêu cầu classify
  }

  // Combined approach
  async classify(page: Page): Promise<PageClassification> {
    const heuristic = await this.classifyByHeuristic(page);
    if (heuristic && heuristic !== PageType.UNKNOWN) {
      return { type: heuristic, confidence: 'high', method: 'heuristic' };
    }
    // Chỉ dùng LLM khi cần
    const dom = await extractSimplifiedDOM(page);
    const llmResult = await this.classifyByLLM(dom);
    return { type: llmResult, confidence: 'medium', method: 'llm' };
  }
}
```

### 8.2 DOM Extractor

**File: `src/analyzers/dom-extractor.ts`**

```typescript
export class DOMExtractor {
  // Trích xuất tất cả interactive elements (buttons, links, inputs)
  async extractInteractiveElements(page: Page): Promise<InteractiveElement[]>;

  // Trích xuất text content chính (loại bỏ nav, footer, sidebar)
  async extractMainContent(page: Page): Promise<string>;

  // Tìm nút "Next", "Continue", "Complete", "Submit" — rất quan trọng
  async findActionButtons(page: Page): Promise<ActionButton[]>;

  // Detect progress indicators  
  async findProgressIndicator(page: Page): Promise<ProgressInfo | null>;
}
```

### 8.3 Completion Detector

**File: `src/analyzers/completion-detector.ts`**

```typescript
export class CompletionDetector {
  // Kiểm tra section hiện tại đã hoàn thành chưa
  async isCompleted(page: Page): Promise<boolean>;

  // Kiểm tra toàn bộ course đã hoàn thành chưa
  async isCourseCompleted(page: Page): Promise<boolean>;
}
```

---

## 9. Module 7 — CLI Interface

### 9.1 Commands

**File: `src/cli.ts`** — Dùng `commander` package

```
# Lần đầu: setup profile
agent profile setup

# Liệt kê Chrome profiles
agent profile list

# Re-sync profile (refresh session)
agent profile sync

# Hoàn thành khóa học
agent complete "Course Name" "https://example.com/course/123"

# Resume khóa học bị dừng
agent resume

# Xem status
agent status

# Config provider
agent config set provider groq
agent config set groq.apiKey sk-xxx
agent config set groq.model llama-3.3-70b-versatile
```

### 9.2 Interactive Flow

```
$ agent complete "AWS Cloud Practitioner" "https://learn.example.com/aws-basics"

🔍 Checking agent profile... ✓ Found
🌐 Launching Chrome with agent profile...
📚 Navigating to course page...
📊 Analyzing course structure...

Found 12 sections:
  1. ☐ Introduction to Cloud Computing
  2. ☐ AWS Global Infrastructure
  3. ☐ Core Services Overview
  ...

⏳ Starting section 1/12: Introduction to Cloud Computing
  📹 Video detected (duration: 15:32)
  ⏩ Playing video... (waiting for completion)
  ✅ Video complete
  🔘 Clicking "Next"...

⏳ Section 2/12: AWS Global Infrastructure
  📖 Reading content detected
  🔘 Scrolling through content...
  🔘 Clicking "Mark as Complete"...
  ✅ Section complete

⏳ Section 3/12: Core Services - Quiz
  📝 Quiz detected (10 questions)
  ❓ Q1: What is EC2? → Selected: B) Virtual Server
  ❓ Q2: What is S3? → Selected: A) Object Storage
  ...
  📊 Score: 8/10 (80%) — PASSED ✓
  ✅ Section complete

📊 Overall Progress: 3/12 sections completed (25%)
...
```

---

## 10. Module 8 — Configuration System

### 10.1 Config File

**File: `config/default.yaml`**

```yaml
# Browser settings
browser:
  headless: false
  viewport:
    width: 1920
    height: 1080
  defaultTimeout: 30000         # 30s default wait timeout
  navigationTimeout: 60000      # 60s for page navigation

# Agent settings
agent:
  maxRetries: 3                 # Retry failed sections
  screenshotOnError: true       # Chụp screenshot khi lỗi
  saveSnapshots: true           # Lưu DOM snapshots
  videoHandling:
    strategy: "wait"            # "wait" = chờ hết video | "skip" = skip nếu có thể
    playbackRate: 2             # Tốc độ phát video (1x, 2x, ...)
    checkInterval: 5000         # Check video status mỗi 5s
  quiz:
    minPassScore: 0             # 0 = không care điểm, cứ submit
    retryOnFail: true           # Retry nếu fail
    maxAttempts: 5              # Số lần thử tối đa

# Database
database:
  path: "./data/agent.db"

# Profile
profile:
  dir: "./data/profiles"

# Logging
logging:
  level: "info"                 # "debug" | "info" | "warn" | "error"
  file: "./data/logs/agent.log"
  pretty: true                  # Pretty print for terminal
```

### 10.2 Config Loader

**File: `src/config/index.ts`** — Implement:
- Load `config/default.yaml` with `js-yaml`
- Load `config/providers.yaml` for LLM configs
- Override with environment variables (pattern: `AGENT_<SECTION>_<KEY>`)
- Validate all with `zod` schema
- Resolve `${ENV_VAR}` placeholders
- Return merged + validated config

### 10.3 Environment Variables

```bash
# .env.example
GROQ_API_KEY=gsk_xxxxx
OPENAI_API_KEY=sk-xxxxx
CUSTOM_LLM_BASE_URL=http://localhost:8080/v1
CUSTOM_LLM_API_KEY=
CUSTOM_LLM_MODEL=my-model

# Override config via env
AGENT_BROWSER_HEADLESS=false
AGENT_VIDEO_PLAYBACK_RATE=2
AGENT_QUIZ_MIN_PASS_SCORE=70
AGENT_LOG_LEVEL=debug
```

---

## 11. Luồng hoạt động chính

### 11.1 Flow chi tiết: `agent complete "Course" "URL"`

```
1. CLI parse arguments
   ↓
2. Load config + initialize logger
   ↓
3. Check agent profile exists
   ├── NO → prompt user to run `agent profile setup` → exit
   └── YES → continue
   ↓
4. Initialize Database (create tables if needed)
   ↓
5. Check if course already in progress (resume)
   ├── YES → load progress, jump to last section
   └── NO → create new course entry
   ↓
6. Initialize BrowserController → launch Chrome with agent profile
   ↓
7. Navigate to course URL
   ↓
8. ╔══════════════════════════════════════╗
   ║  ORCHESTRATOR AGENT — MAIN LOOP     ║
   ╠══════════════════════════════════════╣
   ║                                      ║
   ║  8a. Analyze current page            ║
   ║      → PageClassifier.classify()     ║
   ║      → Check DOM cache for known     ║
   ║        selectors                     ║
   ║                                      ║
   ║  8b. IF page = NAVIGATION:           ║
   ║      → CourseStructureAnalyzer       ║
   ║        .parseSyllabus()              ║
   ║      → Save sections to DB           ║
   ║      → NavigatorAgent.execute()      ║
   ║        (click vào section tiếp       ║
   ║         theo chưa complete)          ║
   ║                                      ║
   ║  8c. IF page = VIDEO:               ║
   ║      → VideoHandlerAgent.execute()   ║
   ║        - Detect player type          ║
   ║        - Set playback rate           ║
   ║        - Wait for video end          ║
   ║        - Click next/complete         ║
   ║                                      ║
   ║  8d. IF page = QUIZ:                ║
   ║      → QuizHandlerAgent.execute()    ║
   ║        - Extract questions           ║
   ║        - Use LLM to answer           ║
   ║        - Fill answers                ║
   ║        - Submit                      ║
   ║        - Check score → retry?        ║
   ║                                      ║
   ║  8e. IF page = READING:             ║
   ║      → ReaderHandlerAgent.execute()  ║
   ║        - Scroll/read through         ║
   ║        - Handle interactions          ║
   ║          (click reveals, expand...)  ║
   ║        - Click complete/next         ║
   ║                                      ║
   ║  8f. IF page = COMPLETION:           ║
   ║      → Mark course complete in DB    ║
   ║      → Report to user               ║
   ║      → EXIT                          ║
   ║                                      ║
   ║  8g. IF page = EXTERNAL:            ║
   ║      → Handle external page          ║
   ║        (read/interact → go back)     ║
   ║                                      ║
   ║  8h. IF page = UNKNOWN:             ║
   ║      → Screenshot + LLM analysis     ║
   ║      → Try best action               ║
   ║                                      ║
   ║  8i. After action → check           ║
   ║      completion → update DB          ║
   ║      → LOOP back to 8a              ║
   ║                                      ║
   ╚══════════════════════════════════════╝
   ↓
9. Course completed or max retries reached
   ↓
10. Close browser, print summary, exit
```

### 11.2 Flow chi tiết: Video Handling

```
VideoHandlerAgent.execute(task):
  1. Detect video player type:
     a. HTML5 <video> element
     b. YouTube iframe (postMessage API)
     c. Vimeo iframe (postMessage API)
     d. Custom player (SCORM, proprietary)

  2. Based on type:
     a. HTML5:
        - page.evaluate(() => { video.playbackRate = 2; video.play(); })
        - Poll video.ended hoặc video.currentTime >= video.duration
     b. YouTube:
        - Inject YT API: player.setPlaybackRate(2); player.playVideo();
        - Listen for state change event (ENDED = 0)
     c. Vimeo:
        - Dùng Vimeo Player API (tự inject nếu chưa có)
     d. Custom:
        - Tìm play button → click
        - Tìm progress bar → wait cho nó full
        - Hoặc đơn giản đợi duration timeout

  3. Xử lý edge cases:
     - Video có quiz giữa chừng (mid-roll quiz) → pause, answer, resume
     - Video require interaction (click to continue) → detect overlay → click
     - Video buffering quá lâu → refresh page, retry
     - Video đã xem (progress saved) → skip nếu có nút skip

  4. Sau video xong:
     - Tìm nút "Next" / "Continue" / "Mark Complete"
     - Click → wait navigation
     - Return result
```

### 11.3 Flow chi tiết: Quiz Handling

```
QuizHandlerAgent.execute(task):
  1. Extract quiz info:
     - Tìm tất cả questions trên page
     - Cho mỗi question:
       a. question_text
       b. question_type (MC, T/F, fill-in, essay, matching, drag-drop)
       c. options (nếu MC/T/F)
       d. Check quiz_history DB — đã trả lời đúng trước đó?

  2. Trả lời:
     a. Nếu có answer đúng trong DB → dùng lại
     b. Nếu không → gửi question + options cho LLM
        - System prompt yêu cầu: phân tích và chọn đáp án đúng nhất
        - Nếu có course content từ reading sections trước → đưa vào context
     c. LLM trả về answer → agent fill vào form

  3. Submit:
     - Tìm nút Submit/Check/Grade
     - Click submit
     - Wait for result

  4. Check result:
     - Parse score (nếu hiển thị)
     - Nếu pass (>= minPassScore) → save answers to DB, mark complete
     - Nếu fail:
       a. Check feedback (đáp án đúng thường được hiển thị)
       b. Save correct answers to DB
       c. Nếu attempts < maxAttempts → retry quiz với answers đúng
       d. Nếu attempts >= maxAttempts → mark failed, continue to next section

  5. Return result
```

---

## 12. Chi tiết từng Agent

### 12.1 Orchestrator Agent

**File: `src/agents/orchestrator.ts`**

**Responsibilities**:
- Main loop: analyze page → dispatch sub-agent → check result → repeat
- Track overall course progress
- Handle errors và retries
- Quyết định skip section nếu stuck quá lâu

**System Prompt** (`prompts/orchestrator.md`):
```markdown
You are a course completion orchestrator. Your job is to analyze the current state
of a web page and decide the next action to take to progress through an online course.

You will receive:
1. The current page URL, title, and simplified DOM
2. The course progress so far
3. Any cached selectors from previous visits

You must respond with a JSON object:
{
  "pageType": "video|quiz|reading|navigation|completion|unknown",
  "action": "dispatch_video|dispatch_quiz|dispatch_reader|dispatch_navigator|click|navigate|done",
  "target": "selector or URL if action is click/navigate",
  "reasoning": "brief explanation of your decision"
}

Rules:
- Always try to progress forward in the course
- If stuck on a page, try finding alternative navigation paths
- If a section appears already completed, skip to the next one
- Report "done" only when the entire course is completed
```

**Implementation by Coding Agent**: Main loop pattern:
1. Get page context (DOM + cache)
2. Classify page (heuristic → LLM fallback)
3. Dispatch to sub-agent based on type
4. Learn and cache selectors on success
5. Update progress in DB
6. Loop until course completed or max iterations

### 12.2 Navigator Agent

**Responsibilities**:
- Parse course syllabus/table of contents
- Click vào section tiếp theo chưa complete
- Handle pagination, lazy loading
- Navigate back to course homepage khi cần

### 12.3 Video Handler Agent

**Responsibilities**:
- Detect video player type (HTML5, YouTube, Vimeo, custom)
- Set playback rate
- Wait for video completion
- Handle mid-roll interactions
- Click next/complete after video

### 12.4 Quiz Handler Agent

**Responsibilities**:
- Extract all questions and options
- Lookup previous answers in DB
- Use LLM to answer new questions
- Fill form and submit
- Parse results, save correct answers
- Retry if failed

### 12.5 Reader Handler Agent

**Responsibilities**:
- Scroll through reading content
- Handle interactive elements (expand, reveal, click-through)
- Detect "complete" trigger (scroll to bottom, click all items, etc.)
- Click next/complete when done

---

## 13. Error Handling & Recovery

### 13.1 Retry Strategy

Implement generic retry utility in `src/utils/retry.ts`:
- Wrap any async function with retry logic
- Support: maxRetries, delayMs, exponential backoff (multiplier)
- Optional: onRetry callback for logging attempts

### 13.2 Error Types & Recovery

| Error | Recovery |
|-------|----------|
| Page navigation timeout | Refresh page, retry navigation |
| Element not found | Re-analyze page DOM, try alternative selectors |
| Video player not loading | Refresh, wait, retry. If 3 fails → skip section |
| Quiz submit failed | Retry submit. If form reset → re-fill answers |
| Session expired (login redirect) | Re-sync profile → restart |
| Chrome crashed | Relaunch browser, resume from last checkpoint |
| LLM API error | Retry with backoff. If persistent → switch to fallback provider |
| Rate limited (LLM) | Wait, retry with exponential backoff |
| Unknown page state | Screenshot → LLM vision analysis → attempt best action |

### 13.3 Checkpoint System

Mỗi lần hoàn thành 1 section → save checkpoint to DB. Nếu process bị kill:
```
$ agent resume
→ Load last checkpoint from DB
→ Navigate to last section URL
→ Continue from there
```

---

## 14. Dependencies

```json
{
  "name": "browser-course-agent",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "build": "tsc",
    "start": "tsx src/index.ts",
    "dev": "tsx watch src/index.ts"
  },
  "dependencies": {
    "playwright": "^1.49.0",
    "openai": "^4.73.0",
    "better-sqlite3": "^11.6.0",
    "commander": "^12.1.0",
    "inquirer": "^12.1.0",
    "js-yaml": "^4.1.0",
    "zod": "^3.23.0",
    "pino": "^9.5.0",
    "pino-pretty": "^13.0.0",
    "dotenv": "^16.4.0",
    "nanoid": "^5.0.0"
  },
  "devDependencies": {
    "typescript": "^5.7.0",
    "tsx": "^4.19.0",
    "@types/better-sqlite3": "^7.6.0",
    "@types/js-yaml": "^4.0.0",
    "@types/inquirer": "^9.0.0",
    "@types/node": "^22.0.0"
  }
}
```

---

## 15. Implementation Order

Implement theo thứ tự sau, mỗi step phải hoạt động được (testable) trước khi tiến sang step tiếp:

### Phase 1: Foundation (Core Infrastructure)

**Step 1.1**: Project setup
- `npm init`, install dependencies
- `tsconfig.json` (ESM, strict mode)
- `.env.example`, `config/default.yaml`, `config/providers.yaml`
- Config loader (`src/config/index.ts`, `src/config/schema.ts`)
- Logger (`src/utils/logger.ts`)
- Retry utility (`src/utils/retry.ts`)

**Step 1.2**: Database
- `src/db/index.ts` — initialize SQLite, run migrations
- `src/db/repositories/dom-cache.ts`
- `src/db/repositories/course-progress.ts`
- Test: create DB, insert/query data

**Step 1.3**: LLM Provider Layer
- `src/llm/types.ts`
- `src/llm/provider.ts` (UnifiedLLMProvider using openai SDK)
- `src/llm/factory.ts`
- Test: gọi Groq/Ollama API, verify response

### Phase 2: Browser & Profile

**Step 2.1**: Chrome Profile Manager
- `src/profile/manager.ts`
- `src/profile/types.ts`
- Test: list profiles, create agent profile

**Step 2.2**: Browser Context + Tools Module Setup
- `src/browser/context.ts` — singleton holder
- `src/browser/types.ts`
- `src/browser-tools/types.ts` — define all ToolInput/ToolOutput interfaces
- `src/browser-tools/index.ts` — export all tools
- **Do NOT implement individual tool files yet** (save for Step 2.3)

**Step 2.3**: Browser Tools Implementation
- `src/browser-tools/navigation.ts` — navigateTo, click, type, scroll
- `src/browser-tools/content.ts` — extractDOMForLLM, getTextContent
- `src/browser-tools/video.ts` — detectVideo, controlVideo
- `src/browser-tools/form.ts` — fillForm, extractFormFields
- `src/browser-tools/detection.ts` — detectPageState, checkElement, waitForState
- Test: each tool individually with mock page

### Phase 3: Analyzers

**Step 3.1**: Page Analyzers (use browser tools)
- `src/analyzers/page-classifier.ts` — uses `detection` tools
- `src/analyzers/course-structure.ts` — uses `content` tools
- `src/analyzers/completion-detector.ts` — uses `detection` tools
- `src/utils/html-sanitizer.ts`

### Phase 4: Agents (use browser tools)

**Step 4.1**: Base Agent + Prompts
- `src/agents/base-agent.ts` — has reference to browser tools
- `src/agents/types.ts`
- All prompt files in `prompts/`

**Step 4.2**: Navigator Agent
- `src/agents/navigator.ts` — uses `navigation`, `detection` tools
- Test with sample course page

**Step 4.3**: Video Handler Agent
- `src/agents/video-handler.ts` — uses `video`, `navigation`, `detection` tools
- Test with video page

**Step 4.4**: Quiz Handler Agent
- `src/agents/quiz-handler.ts` — uses `form`, `content`, `navigation` tools
- Test with quiz page

**Step 4.5**: Reader Handler Agent
- `src/agents/reader-handler.ts` — uses `navigation`, `content`, `detection` tools
- Test with reading page

**Step 4.6**: Orchestrator Agent
- `src/agents/orchestrator.ts` — coordinates sub-agents
- Orchestrator ONLY gọi sub-agents, sub-agents gọi browser tools
- Test full flow

### Phase 5: CLI & MCP Bridge (future)

**Step 5.1**: CLI
- `src/cli.ts`
- `src/index.ts`
- Wire everything together

**Step 5.2**: Optional MCP Bridge
- `mcp-bridge/server.ts` — MCP server wrapping browser-tools
- `mcp-bridge/tool-adapter.ts` — convert tools to MCP format
- Can be done independently, doesn't affect core agent

**Step 5.3**: End-to-end test
- Test complete flow with a real course
- Fix edge cases

---

## Appendix A: Key Design Decisions

### A.1 Playwright over Puppeteer
- Playwright hỗ trợ persistent context (crucial cho profile reuse)
- Better iframe handling
- Auto-wait built-in
- `channel: 'chrome'` dùng Chrome thật thay vì Chromium

### A.2 SQLite over in-memory DB
- Persist across runs (resume capability)
- No external service needed
- `better-sqlite3` is synchronous — simpler code, no async overhead
- Single file, easy backup

### A.3 Single OpenAI SDK for all providers
- Groq, Ollama, và hầu hết LLM providers đều compatible với OpenAI API format
- Không cần viết adapter riêng cho từng provider
- Chỉ cần đổi `baseURL` và `apiKey`

### A.4 Heuristic-first Classification
- Tránh gọi LLM cho mỗi page load (tốn tiền, chậm)
- DOM pattern matching rất accurate cho video/quiz detection
- LLM chỉ dùng khi heuristic uncertain

### A.5 DOM Cache Strategy
- Nhiều trang trong 1 course có layout giống nhau
- Lần đầu: LLM phân tích → tìm selectors
- Lần sau: dùng cached selectors → không cần LLM
- `hit_count` cho biết pattern nào reliable

---

## Appendix B: Prompt Templates

### B.1 Page Classifier Prompt
```markdown
Analyze the following web page DOM and classify it into ONE of these categories:
- VIDEO: Page primarily contains a video player that needs to be watched
- QUIZ: Page contains a quiz, test, or assessment with questions to answer
- READING: Page contains text content to read, may have interactive elements
- NAVIGATION: Page is a course menu, table of contents, or section list
- COMPLETION: Page shows a completion message, certificate, or final summary
- UNKNOWN: Cannot determine the page type

Respond with JSON: {"type": "VIDEO|QUIZ|READING|NAVIGATION|COMPLETION|UNKNOWN", "confidence": 0.0-1.0, "evidence": "brief reason"}

Page DOM:
{dom}
```

### B.2 Quiz Answer Prompt
```markdown
You are answering questions from an online course quiz. Answer each question to the best of your ability.

For each question, respond with JSON:
{
  "answers": [
    {
      "questionIndex": 0,
      "selectedOption": "A",
      "confidence": 0.85,
      "reasoning": "brief explanation"
    }
  ]
}

Questions:
{questions}
```

### B.3 Navigation Analysis Prompt
```markdown
Analyze this course page and identify the course structure (sections/modules).
For each section, determine if it's completed or still pending.

Respond with JSON:
{
  "sections": [
    {
      "index": 0,
      "title": "Section name",
      "url": "link href if available",
      "status": "completed|pending|locked",
      "selector": "CSS selector to click this section"
    }
  ],
  "nextActionSelector": "CSS selector for the next incomplete section"
}

Page DOM:
{dom}
```

---

## Appendix C: Security Notes

- API keys chỉ lưu trong `.env` (gitignored) hoặc env vars
- Chrome profile chứa credentials — folder `data/profiles/` phải gitignored
- Không log sensitive data (cookies, tokens, passwords)
- SQLite DB chứa course content — nên gitignored
- `.gitignore` phải bao gồm: `data/`, `.env`, `*.db`

---

## Appendix D: Playwright-MCP vs Direct Playwright

### Maturity Comparison

| Yếu tố | Playwright-MCP | Direct Playwright |
|--------|---|---|
| **Architecture** | HTTP + JSON RPC | Node.js SDK |
| **Token Efficiency** | Accessibility tree (5-15K) | Aggressive sanitize (2-4K) ✅ |
| **Network Interception** | ❌ No | ✅ Yes |
| **Video Control** | ❌ Limited | ✅ Full (JS eval, postMessage) |
| **Profile Reuse** | ✅ Yes (--user-data-dir) | ✅ Yes (persistent context) |
| **Context Window** | Needs careful management | Can optimize DOM locally ✅ |
| **Learning Curve** | Medium (MCP protocol) | Low (direct SDK) |
| **Debuggability** | Remote debugging via browser | Local browser window ✅ |
| **Latency** | Higher (HTTP overhead) | Lower (in-process) ✅ |
| **Standard Groq 8K** | ⚠️ Risky | ✅ Feasible |

### Real-world Test Scenario

**Task**: Answer quiz with 20 multiple-choice questions on Coursera-like platform.

**Playwright-MCP**:
```
DOM (full) → 18K tokens
Accessibility tree → 8K tokens
Request overhead → serialize/deserialize
Total incl. system prompt → 9.5K → EXCEEDS 8K ❌
```

**Direct Playwright**:
```
Full DOM → 18K tokens
extractLLMFriendlyDOM() → 2.8K tokens
No HTTP overhead
Total incl. system prompt → 3.5K → FITS comfortably ✅
```

### Decision Matrix

Use **Playwright-MCP if**:
- Building LLM-agnostic browser tool (MCP is standard)
- Want to support multiple LLM clients
- Don't need real-time video/media control
- Can afford higher token budget

Use **Direct Playwright if** (our case ✅):
- Single Node.js app (not multi-client)
- Need token efficiency (Groq free tier)
- Complex video/form handling needed
- Faster iteration + better debugging

### Migration Path

If later needed to expose as service:
1. Keep core agent as direct Playwright
2. Wrap with MCP bridge layer (thin adapter)
3. MCP → convert → call core agent → convert → MCP response
4. No rework of core logic needed

---

## Appendix E: Browser Tools as MCP Server (Future)

### How to Port browser-tools to MCP

Since all Playwright logic is isolated in `browser-tools/`, wrapping as MCP server is straightforward:

**File: `mcp-bridge/server.ts`**

```typescript
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import * as browserTools from '../src/browser-tools';
import { chromium, BrowserContext } from 'playwright';

const mcp = new Server({
  name: 'browser-tools-mcp',
  version: '1.0.0',
});

let browserContext: BrowserContext;

// Initialize browser
async function initBrowser() {
  const browser = await chromium.launch({ channel: 'chrome' });
  browserContext = await browser.createBrowserContext();
}

// Register all browser tools as MCP tools
mcp.tool('navigate_to', {
  description: 'Navigate to a URL',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string' },
      timeout: { type: 'number' },
    },
    required: ['url'],
  },
  handler: async (input) => {
    const page = await browserContext.newPage();
    const result = await browserTools.navigation.navigateTo(page, input.url, {
      timeout: input.timeout,
    });
    return {
      content: [{ type: 'text', text: JSON.stringify(result) }],
    };
  },
});

mcp.tool('click', {
  description: 'Click an element',
  inputSchema: {
    type: 'object',
    properties: {
      selector: { type: 'string' },
      waitFor: { type: 'string' },
    },
    required: ['selector'],
  },
  handler: async (input) => {
    const pages = browserContext.pages();
    const page = pages[pages.length - 1];
    const result = await browserTools.navigation.click(page, input);
    return {
      content: [{ type: 'text', text: JSON.stringify(result) }],
    };
  },
});

mcp.tool('fill_form', {
  description: 'Fill form fields',
  inputSchema: {
    type: 'object',
    properties: {
      fields: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            selector: { type: 'string' },
            value: { type: 'string' },
            type: { type: 'string', enum: ['text', 'select', 'checkbox', 'radio'] },
          },
        },
      },
      submitSelector: { type: 'string' },
    },
    required: ['fields'],
  },
  handler: async (input) => {
    const pages = browserContext.pages();
    const page = pages[pages.length - 1];
    const result = await browserTools.form.fillForm(page, input);
    return {
      content: [{ type: 'text', text: JSON.stringify(result) }],
    };
  },
});

// ... repeat for all tools in browser-tools/

// Main
(async () => {
  await initBrowser();
  const transport = new StdioServerTransport();
  await mcp.connect(transport);
})();
```

**Usage in LLM Client** (Claude, etc.):

```json
{
  "mcpServers": {
    "browser-tools": {
      "command": "node",
      "args": ["mcp-bridge/server.js"]
    }
  }
}
```

**Benefits**:
- ✅ Reuse existing browser-tools code (zero modification)
- ✅ Works with any MCP client (Claude Desktop, Cursor, VS Code, etc.)
- ✅ LLM can use browser tools independently
- ✅ No need to rewrite tool logic

**Limitations**:
- ❌ Less efficient than direct Node.js (JSON serialization overhead)
- ❌ Slower execution (HTTP between processes)
- ❌ Suitable for exploratory tasks, not production course completion

**Recommendation**: 
- **Keep direct Playwright for production agent** (faster, cheaper)
- **MCP bridge for LLM exploration** (e.g., "Help me navigate this page")

---

## Appendix F: Browser Tools Testing Strategy

### Unit Testing Tools

```typescript
// tests/browser-tools.test.ts
import { click, type } from '../src/browser-tools/navigation';
import { extractDOMForLLM } from '../src/browser-tools/content';
import { expect } from 'chai';

describe('Browser Tools', () => {
  let mockPage;

  beforeEach(() => {
    // Create mock page
    mockPage = {
      click: sinon.stub(),
      fill: sinon.stub(),
      evaluate: sinon.stub(),
      screenshot: sinon.stub(),
    };
  });

  describe('navigation.click', () => {
    it('should click element and wait for selector', async () => {
      mockPage.click.resolves();

      const result = await click(mockPage, {
        selector: '.btn-next',
        waitFor: '.content',
      });

      expect(result.success).to.be.true;
      expect(mockPage.click.calledOnce).to.be.true;
    });

    it('should return error on failure', async () => {
      mockPage.click.rejects(new Error('Element not found'));

      const result = await click(mockPage, {
        selector: '.btn-next',
      });

      expect(result.success).to.be.false;
      expect(result.error).to.include('Element not found');
    });
  });

  describe('content.extractDOMForLLM', () => {
    it('should truncate large DOM', async () => {
      mockPage.evaluate.resolves('<html>' + 'a'.repeat(100000) + '</html>');

      const result = await extractDOMForLLM(mockPage, {
        maxTokens: 1000,
      });

      expect(result.data.truncated).to.be.true;
      expect(result.data.estimatedTokens).to.be.lessThan(250000 / 4); // rough token estimate
    });
  });
});
```

### Integration Testing Agents

```typescript
describe('QuizHandlerAgent with Browser Tools', () => {
  it('should fill and submit quiz', async () => {
    // Mock browser tools
    const toolsMock = {
      detection: {
        detectPageState: sinon.stub().resolves({
          success: true,
          data: { hasQuiz: true },
        }),
      },
      content: {
        extractDOMForLLM: sinon.stub().resolves({
          success: true,
          data: { html: '<form>...</form>', truncated: false },
        }),
      },
      form: {
        fillForm: sinon.stub().resolves({
          success: true,
          data: { filled: 3 },
        }),
      },
    };

    // Replace tools with mocks
    const agent = new QuizHandlerAgent(deps);
    agent.tools = toolsMock;

    const result = await agent.execute(task);

    expect(result.success).to.be.true;
    expect(toolsMock.form.fillForm.calledOnce).to.be.true;
  });
});
```

---

## Appendix G: Coding Style & Patterns Guide

### G.1 General Principles

⚠️ **NOTE**: This plan intentionally omits detailed implementation code. Coding agent should:
- Make independent architectural decisions for function bodies
- Use established best practices from the ecosystem
- Choose idiomatic patterns for TypeScript/Node.js
- Apply consistent style across all modules

### G.2 TypeScript Configuration

**tsconfig.json** requirements:
- `"module": "ES2020"` + `"moduleResolution": "node"` (ESM)
- `"strict": true` (all strict checks enabled)
- `"resolveJsonModule": true` (for YAML/JSON loading)
- `"skipLibCheck": true` (faster compilation)
- `"noImplicitAny": true` (catch untyped variables)

### G.3 Function-based Tools Pattern

```typescript
// ✅ CORRECT pattern: Pure functions with consistent interface
export async function toolName(
  page: Page,
  input: SpecificToolInput
): Promise<ToolOutput<ReturnDataType>> {
  const start = Date.now();
  try {
    // Implementation
    return {
      success: true,
      data: result,
      duration: Date.now() - start,
    };
  } catch (error) {
    return {
      success: false,
      error: String(error),
      duration: Date.now() - start,
      screenshot: input.screenshot ? await page.screenshot() : undefined,
    };
  }
}

// ❌ WRONG: Throwing exceptions, not returning ToolOutput
export async function toolName(page: Page, input: any) {
  // Throws on error → agents must try/catch
  // Returns raw data → inconsistent signatures
}
```

**Key Characteristics**:
1. **Consistency**: All tools return `ToolOutput<T>` structure
2. **No exceptions**: Tools handle errors and return `success: false`
3. **Metadata**: Always return `duration` (ms), optionally `screenshot`
4. **Timeouts**: Respect `input.timeout` parameter
5. **Logging**: Agents do logging, tools stay silent (except errors)

### G.4 Agent Base Class Pattern

```typescript
// ✅ CORRECT: Abstract base class with common logic
export abstract class BaseAgent {
  protected name: string;
  protected llm: LLMProvider;
  protected browser: BrowserController;
  protected db: Database;
  protected logger: Logger;

  abstract getTaskType(): AgentTaskType;
  abstract execute(task: AgentTask): Promise<AgentResult>;

  // Common methods for all agents
  protected async think(message: string, options?: ChatOptions): Promise<string> {
    // Always add system prompt + validate context
  }

  protected async thinkJSON<T>(message: string): Promise<T> {
    // Call think() + parse JSON + handle errors
  }

  protected async getPageContext(): Promise<string> {
    // Extract DOM + cache + current state
  }
}

// ✅ CORRECT: Sub-agents override only execute()
export class QuizHandlerAgent extends BaseAgent {
  async execute(task: AgentTask): Promise<AgentResult> {
    // 1. Call browser tools
    // 2. Call think() for decisions
    // 3. Return structured result
  }
}
```

**Key Principles**:
1. **Inherit from BaseAgent**: Get LLM, browser, DB, logger automatically
2. **Override execute()**: Orchestration logic only
3. **Use this.think()**: Always through base class
4. **No instance state**: Agents are stateless, use DB for persistence
5. **Tool-centric**: Agents chain tools, don't mix Playwright

### G.5 Error Handling Pattern

```typescript
// ✅ CORRECT: Validation → Operation → Context-aware error
export async function click(
  page: Page,
  input: ClickToolInput
): Promise<ToolOutput<...>> {
  // 1. Validate input
  if (!input.selector) {
    return { success: false, error: 'Missing selector' };
  }

  // 2. Attempt with logging
  try {
    await page.click(input.selector, { timeout: input.timeout });
  } catch (error) {
    // Include context: what was attempted, why it failed
    return {
      success: false,
      error: `Failed to click "${input.selector}": ${String(error)}`,
    };
  }

  // 3. Verify result if possible
  const newUrl = page.url();
  return { success: true, data: { clicked: input.selector, newUrl } };
}

// ❌ WRONG: Bare try/catch with generic error
try {
  await page.click(input.selector);
} catch (e) {
  throw e; // Let agent handle → agents shouldn't try/catch
}
```

**Key Patterns**:
1. **Validate early**: Check required inputs first
2. **Error context**: Include what/why in error message
3. **Don't throw**: Return error in ToolOutput
4. **Include metadata**: Duration, screenshot on failure
5. **Log at agent level**: Tools stay quiet

### G.6 Database Repository Pattern

```typescript
// ✅ CORRECT: Type-safe repository with focused queries
export class DOMCacheRepository {
  constructor(private db: Database) {}

  findByUrl(url: string): DOMCacheEntry | null {
    // SELECT * FROM dom_cache WHERE url_pattern LIKE '%...%'
    // Return typed object or null (not Error)
  }

  upsert(entry: DOMCacheEntry): void {
    // INSERT OR REPLACE INTO...
    // No return value, side effect only
  }

  incrementHitCount(id: number): void {
    // UPDATE dom_cache SET hit_count = hit_count + 1
  }
}

// ❌ WRONG: Generic DB queries in agent
const result = await db.query('SELECT * FROM dom_cache WHERE ...');
agent.handleResult(result); // Parsing logic mixed in agent
```

**Key Principles**:
1. **One repository per table**: DOMCacheRepository, CourseProgressRepository, etc.
2. **Type-safe returns**: Typed objects, not raw DB rows
3. **Focused methods**: One method = one feature
4. **No query logic in agents**: All queries in repos
5. **Consistent naming**: find*, upsert, increment*, mark*

### G.7 Config & Environment Pattern

```typescript
// ✅ CORRECT: Config loader with env override + validation
import { z } from 'zod';
import yaml from 'js-yaml';

const configSchema = z.object({
  browser: z.object({
    headless: z.boolean(),
    timeout: z.number().min(1000),
  }),
  // ... more fields
});

export function loadConfig(): AppConfig {
  // 1. Load base config from yaml
  const base = yaml.load(fs.readFileSync('config/default.yaml'));

  // 2. Override with environment variables
  const envOverrides = {
    browser: {
      headless: process.env.AGENT_BROWSER_HEADLESS === 'true',
    },
  };

  // 3. Merge + validate
  const merged = deepMerge(base, envOverrides);
  return configSchema.parse(merged);
}

// ❌ WRONG: Hard-coded config values
const BROWSER_TIMEOUT = 30000; // What if need to override?
const DEBUG = true; // Should be config-driven
```

**Key Principles**:
1. **YAML for defaults**: Human-readable defaults in config/
2. **Env vars override**: Runtime configuration via ENV
3. **Zod validation**: Schema enforcement + type inference
4. **Single source of truth**: LoadConfig() called once at startup
5. **Fail fast**: Invalid config → exit with clear error

### G.8 Logger Pattern (Pino)

```typescript
// ✅ CORRECT: Logger with context hierarchy
import pino from 'pino';

const logger = pino({
  level: config.logging.level,
  transport: config.logging.pretty ? { target: 'pino-pretty' } : undefined,
});

// In sub-agents: inherit context
class QuizHandlerAgent {
  private logger: pino.Logger;

  constructor(deps) {
    this.logger = deps.logger.child({ agent: 'QuizHandler' });
  }

  async execute(task) {
    this.logger.info({ taskId: task.id }, 'Starting task');
    // ... work
    this.logger.debug({ result }, 'Task complete');
  }
}

// ❌ WRONG: Using console.log or creating new logger instances
console.log('Debug info'); // No timestamps, no structure
logger = pino(); // Loses context hierarchy
```

**Key Principles**:
1. **Structured logging**: Objects, not string interpolation
2. **Child loggers**: Inherit agent/module context
3. **Levels**: debug, info, warn, error (use appropriately)
4. **Bind metadata**: Request IDs, task IDs in context
5. **File output**: Log to file for production debugging

### G.9 Async Error Handling with Retry

```typescript
// ✅ CORRECT: Generic retry utility
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: {
    maxRetries: number;
    delayMs: number;
    backoffMultiplier?: number;
  }
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt < options.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      const delay = options.delayMs * Math.pow(options.backoffMultiplier || 1, attempt);
      await new Promise(r => setTimeout(r, delay));
    }
  }

  throw lastError;
}

// Usage in tools:
export async function navigateTo(page: Page, url: string, input: ToolInput) {
  try {
    return await withRetry(
      () => page.goto(url, { waitUntil: 'domcontentloaded' }),
      { maxRetries: 3, delayMs: 1000, backoffMultiplier: 2 }
    );
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

// ❌ WRONG: Retry logic repeated in every function
for (let i = 0; i < 3; i++) {
  try {
    await page.goto(url);
    break;
  } catch (e) {
    if (i === 2) throw e;
    await sleep(1000);
  }
}
```

### G.10 Testing Strategy

```typescript
// ✅ CORRECT: Mock tools at agent level, test behavior
describe('QuizHandlerAgent', () => {
  let agent: QuizHandlerAgent;
  let toolsMock: Partial<BrowserTools>;

  beforeEach(() => {
    // Mock ALL tools
    toolsMock = {
      detection: {
        detectPageState: mockFn().resolves({ success: true, data: { hasQuiz: true } }),
      },
      content: {
        extractDOMForLLM: mockFn().resolves({ success: true, data: { html: '<form></form>' } }),
      },
      form: {
        fillForm: mockFn().resolves({ success: true, data: { filled: 3 } }),
      },
    };

    agent = new QuizHandlerAgent({ tools: toolsMock, /* ... */ });
  });

  it('should fill form and submit quiz', async () => {
    const result = await agent.execute(mockTask);

    expect(result.success).to.be.true;
    expect(toolsMock.form.fillForm).called;
  });
});

// ✅ CORRECT: Test tools with mock Playwright page
describe('form.fillForm', () => {
  let pageM: MockPage;

  beforeEach(() => {
    pageM = createMockPage();
  });

  it('should fill text input', async () => {
    const result = await fillForm(pageM, {
      fields: [{ selector: 'input[name="email"]', value: 'test@example.com', type: 'text' }],
    });

    expect(result.success).to.be.true;
    expect(pageM.fill).calledWith('input[name="email"]', 'test@example.com');
  });
});

// ❌ WRONG: Testing with real browser (slow, unreliable in CI)
describe('QuizHandlerAgent', () => {
  it('should complete quiz on real course site', async () => {
    const browser = await chromium.launch();
    // ... navigate to real site, fill real quiz
    // Slow, flaky, depends on external site
  });
});
```

**Key Principles**:
1. **Cohesion**: Files grouped by feature/concern
2. **Separation**: Tools separate from agents, DB separate from logic
3. **Scalability**: Easy to add new agents, tools, analyzers
4. **Testability**: Each layer can be tested independently
5. **Clarity**: Obvious where new code belongs

### G.12 Naming Conventions

| Category | Pattern | Example |
|----------|---------|---------|
| **Functions** | camelCase, verb-noun | `navigateTo`, `extractDOMForLLM`, `waitForState` |
| **Classes** | PascalCase | `QuizHandlerAgent`, `PageClassifier` |
| **Constants** | UPPER_SNAKE_CASE | `MAX_RETRIES`, `DEFAULT_TIMEOUT` |
| **Interfaces** | PascalCase, no `I` prefix | `ToolInput`, `AgentTask` (not `IToolInput`) |
| **Type Aliases** | PascalCase | `PageType`, `LLMMessage` |
| **Private methods** | camelCase, leading `#` | `#validateInput()` |
| **Booleans** | is/has prefix | `isComplete`, `hasVideo` |
| **Getters** | get + noun | `getPageContext()`, `getProvider()` |
| **Files** | kebab-case or camelCase | `page-classifier.ts`, `base-agent.ts` |

### G.13 Code Style Checks

Recommend using:
- **Prettier**: Auto-format files (2 spaces, single quotes)

## Summary: Implementation Notes for Coding Agent

✅ **What's Specified**:
- Architecture and module structure
- Type signatures and interfaces
- Design patterns and principles
- Communication protocols between components
- Configuration system and environment variables
- Database schema and repositories
- Prompt templates (high-level)
- Error handling and recovery strategies
- Testing approach

**Recommendation**: Use established patterns from:
- Playwright official examples
- Node.js best practices
- TypeScript strict mode patterns
- Async/await error handling
