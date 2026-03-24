// Browser tools type definitions
// All tools follow the pattern: (page: Page, input: ToolInput) => Promise<ToolOutput>

export interface ToolInput {
  timeout?: number;
  retryCount?: number;
  verbose?: boolean;
  screenshot?: boolean;
}

export interface ToolOutput<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  duration: number; // milliseconds
  screenshot?: Buffer;
}

// Navigation Tool Types
export interface ClickToolInput extends ToolInput {
  selector: string;
  button?: 'left' | 'right' | 'middle';
  clickCount?: number;
  delay?: number;
  scrollIntoView?: boolean;
  waitForNavigation?: boolean;
}

export interface TypeToolInput extends ToolInput {
  selector: string;
  text: string;
  delay?: number;
  clear?: boolean;
}

export interface NavigateToolInput extends ToolInput {
  url: string;
  waitUntil?: 'load' | 'domcontentloaded' | 'networkidle';
}

export interface ScrollToolInput extends ToolInput {
  direction: 'up' | 'down' | 'left' | 'right';
  amount?: number;
  selector?: string; // Scroll within element
}

// Content Tool Types
export interface ExtractDOMToolInput extends ToolInput {
  maxTokens?: number;
  strategy?: 'full' | 'accessibility' | 'llm-friendly';
  includeInteractive?: boolean;
  includeAttributes?: string[];
}

export interface ExtractDOMToolOutput {
  html: string;
  text: string;
  truncated: boolean;
  estimatedTokens: number;
  interactiveElements?: InteractiveElement[];
}

export interface InteractiveElement {
  selector: string;
  type: string; // 'button' | 'link' | 'input' | 'select' | etc.
  text?: string;
  visible: boolean;
  ariaLabel?: string;
}

// Video Tool Types
export interface DetectVideoToolInput extends ToolInput {
  analyzeContent?: boolean;
}

export interface VideoInfo {
  detected: boolean;
  type?: 'html5' | 'youtube' | 'vimeo' | 'custom';
  selector?: string;
  currentTime?: number;
  duration?: number;
  paused?: boolean;
  playbackRate?: number;
}

export interface ControlVideoToolInput extends ToolInput {
  action: 'play' | 'pause' | 'setRate' | 'seek' | 'getState';
  rate?: number; // For setRate
  time?: number; // For seek
  pollInterval?: number;
  waitForFinish?: boolean;
}

// Form Tool Types
export interface FormField {
  selector: string;
  type: 'text' | 'checkbox' | 'radio' | 'select' | 'textarea' | 'button';
  name?: string;
  label?: string;
  required?: boolean;
  value?: string;
  options?: string[]; // For select/radio
}

export interface FillFormToolInput extends ToolInput {
  fields: Array<{
    selector: string;
    value: any;
  }>;
  submitSelector?: string;
  waitForNavigation?: boolean;
}

export interface ExtractFormToolInput extends ToolInput {
  formSelector?: string;
}

// Detection Tool Types
export interface PageStateInfo {
  hasQuiz: boolean;
  hasVideo: boolean;
  hasNavigation: boolean;
  hasCompletionMessage: boolean;
  estimatedPageType: 'video' | 'quiz' | 'reading' | 'navigation' | 'unknown';
  indicators: string[];
}

export interface CheckElementToolInput extends ToolInput {
  selector: string;
  state?: 'visible' | 'hidden' | 'enabled' | 'disabled' | 'exists';
}

export interface WaitForStateToolInput extends ToolInput {
  selector: string;
  state: 'visible' | 'hidden' | 'enabled' | 'disabled';
  maxWaitTime?: number;
}

// Screenshot Tool Types
export interface ScreenshotToolInput extends ToolInput {
  path?: string;
  fullPage?: boolean;
  mask?: string[]; // Selectors to mask
}

export interface HoverToolInput extends ToolInput {
  selector: string;
  timeout?: number;
}

export interface KeyboardToolInput extends ToolInput {
  key: string;
  modifiers?: ('Control' | 'Shift' | 'Alt' | 'Meta')[];
  press?: boolean; // press+release vs keyDown/keyUp
}

// Quiz-specific types
export interface QuizQuestion {
  number: number;
  text: string;
  type: 'multiple-choice' | 'text-input' | 'true-false' | 'matching' | 'essay';
  options?: string[];
  correctAnswer?: string;
  userAnswer?: string;
}

export interface QuizInfo {
  detected: boolean;
  questionCount: number;
  questions?: QuizQuestion[];
  submitSelector?: string;
  timeLimit?: number;
}

// Interaction results
export interface NavigationResult {
  success: boolean;
  currentUrl: string;
  pageTitle: string;
}

export interface FormFillResult {
  success: boolean;
  fieldsFilled: number;
  fieldsFailed: number;
  errors?: Record<string, string>;
}

export interface ClickResult {
  success: boolean;
  clicked: boolean;
  newUrl?: string;
}
