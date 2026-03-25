import * as fs from 'fs';
import * as path from 'path';
import { Page } from 'playwright';
import { LLMProvider, AgentTaskType, LLMMessage } from '../llm/types.js';
import { BrowserController } from '../browser/controller.js';
import { AgentDatabase } from '../db/index.js';
import { AgentTask, AgentResult, AgentTaskType as AgentTaskTypeAlias } from './types.js';
import { extractDOMForLLM } from '../browser-tools/content.js';
import { getLogger } from '../utils/logger.js';

const logger = getLogger();

export abstract class BaseAgent {
  protected llmProvider: LLMProvider;
  protected browser: BrowserController;
  protected db: AgentDatabase;
  protected systemPrompt: string = '';

  constructor(llmProvider: LLMProvider, browser: BrowserController, db: AgentDatabase) {
    this.llmProvider = llmProvider;
    this.browser = browser;
    this.db = db;

    // Load system prompt
    this.loadSystemPrompt();
  }

  /**
   * Get agent's task type
   */
  abstract getTaskType(): AgentTaskTypeAlias;

  /**
   * Get prompt file name (e.g., 'orchestrator.md')
   */
  abstract getPromptFileName(): string;

  /**
   * Execute agent task
   */
  abstract execute(task: AgentTask): Promise<AgentResult>;

  /**
   * Load system prompt from file
   */
  private loadSystemPrompt(): void {
    try {
      const fileName = this.getPromptFileName();
      const promptPath = path.join(process.cwd(), 'prompts', fileName);

      if (fs.existsSync(promptPath)) {
        this.systemPrompt = fs.readFileSync(promptPath, 'utf-8');
      } else {
        logger.warn(`Prompt file not found: ${promptPath}`);
        this.systemPrompt = `You are a helpful browser agent. Complete the given task.`;
      }
    } catch (error) {
      logger.error({ error }, 'Error loading system prompt');
      this.systemPrompt = `You are a helpful browser agent. Complete the given task.`;
    }
  }

  /**
   * Call LLM to generate response
   */
  protected async think(userMessage: string, options?: { temperature?: number; maxTokens?: number }): Promise<string> {
    const taskType = this.getTaskType();
    const messages: LLMMessage[] = [
      {
        role: 'system',
        content: this.systemPrompt,
      },
      {
        role: 'user',
        content: userMessage,
      },
    ];

    try {
      logger.info(`[${taskType.toUpperCase()}] Calling LLM for analysis...`);
      const startTime = Date.now();
      const response = await this.llmProvider.chat(messages, options);
      logger.info(`[${taskType.toUpperCase()}] LLM response received (${Date.now() - startTime}ms)`);
      return response.content;
    } catch (error) {
      logger.error({ error }, `[${taskType.toUpperCase()}] LLM chat error`);
      throw error;
    }
  }

  /**
   * Call LLM with JSON response
   */
  protected async thinkJSON<T = any>(userMessage: string): Promise<T> {
    const taskType = this.getTaskType();
    const messages: LLMMessage[] = [
      {
        role: 'system',
        content: this.systemPrompt,
      },
      {
        role: 'user',
        content: userMessage + '\n\nRespond in valid JSON format.',
      },
    ];

    try {
      logger.info(`[${taskType.toUpperCase()}] Calling LLM for JSON analysis...`);
      const startTime = Date.now();
      const response = await this.llmProvider.chat(messages, { jsonMode: true });
      logger.info(`[${taskType.toUpperCase()}] LLM JSON response received (${Date.now() - startTime}ms)`);
      return JSON.parse(response.content);
    } catch (error) {
      logger.error({ error }, `[${taskType.toUpperCase()}] LLM JSON chat error`);
      throw error;
    }
  }

  /**
   * Get current page context for LLM
   */
  protected async getPageContext(maxTokens: number = 2000): Promise<string> {
    const page = this.browser.getActivePage();

    try {
      const domResult = await extractDOMForLLM(page, { maxTokens, strategy: 'llm-friendly' });
      const html = domResult.data?.html || '';
      const text = domResult.data?.text || '';

      return `
Page URL: ${page.url()}
Page Title: ${await page.title()}

DOM Content (estimated tokens: ${domResult.data?.estimatedTokens}):
${html}

Text Content:
${text}
      `.trim();
    } catch (error) {
      logger.error({ error }, 'Error getting page context');
      return '';
    }
  }

  /**
   * Log action - visible progress updates for user
   */
  protected logAction(action: string, details?: string): void {
    const taskType = this.getTaskType();
    const message = `[${taskType.toUpperCase()}] ${action}${details ? ': ' + details : ''}`;
    logger.info(message);
  }

  /**
   * Log error with context
   */
  protected logError(action: string, error: unknown): void {
    const taskType = this.getTaskType();
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error(`[${taskType.toUpperCase()}] ${action} failed: ${errorMsg}`);
  }
}
