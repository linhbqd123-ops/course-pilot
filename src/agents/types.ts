import { Page } from 'playwright';
import { LLMMessage } from '../llm/types.js';

export type AgentTaskType =
  | 'orchestrator'
  | 'navigator'
  | 'video_handler'
  | 'quiz_handler'
  | 'reader_handler'
  | 'page_classifier';

export interface AgentTask {
  id: string;
  type: AgentTaskType;
  description: string;
  context?: Record<string, any>;
  metadata?: Record<string, any>;
  timeoutMs?: number;
}

export interface AgentResult {
  success: boolean;
  taskId: string;
  action?: string;
  message?: string;
  data?: Record<string, any>;
  error?: string;
  durationMs?: number;
  learnedSelectors?: Record<string, string>;
}

export interface AgentContext {
  page: Page;
  currentUrl: string;
  pageTitle: string;
}
