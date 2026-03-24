import { BaseAgent } from './base-agent.js';
import { AgentTask, AgentResult } from './types.js';
import * as browserTools from '../browser-tools/index.js';
import { getLogger } from '../utils/logger.js';

const logger = getLogger();

/**
 * Video Handler Agent - Handles video content
 */
export class VideoHandlerAgent extends BaseAgent {
  getTaskType() {
    return 'video_handler' as const;
  }

  getPromptFileName(): string {
    return 'video-handler.md';
  }

  async execute(task: AgentTask): Promise<AgentResult> {
    const startTime = Date.now();
    const taskId = task.id;

    try {
      const page = this.browser.getActivePage();
      this.logAction('Detecting video...');

      // Detect video on page
      const videoResult = await browserTools.detectVideo(page, {});

      if (!videoResult.data?.detected) {
        return {
          success: false,
          taskId,
          message: 'No video detected on page',
          durationMs: Date.now() - startTime,
        };
      }

      this.logAction('Video detected', videoResult.data.type);

      // Ask LLM for strategy
      const context = await this.getPageContext();
      const strategy = await this.think(`
${context}

A video was detected on this page. What is the best approach to complete watching this video?
Consider if we should:
1. Play the video at faster speed
2. Skip segments if possible
3. Just play and wait for completion

Provide your recommendations in a brief sentence.
`);

      this.logAction('Strategy', strategy);

      // Play video and wait for it to finish
      this.logAction('Starting video playback...');

      // Set playback speed to 1.5x if possible
      const rateResult = await browserTools.controlVideo(page, {
        action: 'setRate',
        rate: 1.5,
      });

      if (rateResult.success) {
        this.logAction('Playback speed set to 1.5x');
      }

      // Start playback
      const playResult = await browserTools.controlVideo(page, {
        action: 'play',
        waitForFinish: true,
      });

      if (!playResult.success) {
        return {
          success: false,
          taskId,
          message: 'Failed to play video',
          error: playResult.error,
          durationMs: Date.now() - startTime,
        };
      }

      this.logAction('Video completed');

      // Look for completion message or next button
      await new Promise((resolve) => setTimeout(resolve, 2000));

      const nextButton = await browserTools.checkElement(page, {
        selector: 'button[aria-label*="next"], .btn-next, [class*="next-button"]',
      });

      if (nextButton.data?.visible) {
        this.logAction('Found next button, clicking...');
        await browserTools.click(page, {
          selector: 'button[aria-label*="next"], .btn-next, [class*="next-button"]',
        });
      }

      return {
        success: true,
        taskId,
        action: 'video_completed',
        message: 'Video watched and completed',
        durationMs: Date.now() - startTime,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      logger.error({ error }, 'Video handler error');

      return {
        success: false,
        taskId,
        error: errorMsg,
        message: `Failed to handle video: ${errorMsg}`,
        durationMs: Date.now() - startTime,
      };
    }
  }
}

/**
 * Quiz Handler Agent - Handles quiz/assessment content
 */
export class QuizHandlerAgent extends BaseAgent {
  getTaskType() {
    return 'quiz_handler' as const;
  }

  getPromptFileName(): string {
    return 'quiz-handler.md';
  }

  async execute(task: AgentTask): Promise<AgentResult> {
    const startTime = Date.now();
    const taskId = task.id;

    try {
      const page = this.browser.getActivePage();
      this.logAction('Extracting quiz questions...');

      // Extract form fields
      const fieldsResult = await browserTools.extractFormFields(page, {});

      if (!fieldsResult.success || !fieldsResult.data?.fields.length) {
        return {
          success: false,
          taskId,
          message: 'No form fields found',
          durationMs: Date.now() - startTime,
        };
      }

      const context = await this.getPageContext();

      // Ask LLM to answer questions
      const answers = await this.thinkJSON<Record<string, any>>(
        `${context}

Please analyze this quiz and provide answers for the questions.
Format your response as JSON with field selectors as keys and values as the answers.

Available form fields:
${JSON.stringify(fieldsResult.data.fields, null, 2)}

Respond ONLY with valid JSON.`
      );

      this.logAction('LLM provided answers');

      // Fill form with answers
      const fields = Object.entries(answers).map(([selector, value]) => ({
        selector,
        value,
      }));

      const fillResult = await browserTools.fillForm(page, {
        fields,
        submitSelector: 'button[type="submit"], .btn-submit, [class*="submit"]',
        waitForNavigation: true,
      });

      if (!fillResult.success) {
        return {
          success: false,
          taskId,
          error: fillResult.error,
          message: 'Failed to fill quiz form',
          durationMs: Date.now() - startTime,
        };
      }

      this.logAction('Quiz submitted');

      return {
        success: true,
        taskId,
        action: 'quiz_completed',
        message: 'Quiz completed and submitted',
        data: {
          fieldsFilled: fillResult.data?.fieldsFilled,
        },
        durationMs: Date.now() - startTime,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      logger.error({ error }, 'Quiz handler error');

      return {
        success: false,
        taskId,
        error: errorMsg,
        message: `Failed to handle quiz: ${errorMsg}`,
        durationMs: Date.now() - startTime,
      };
    }
  }
}

/**
 * Reader Agent - Handles reading content
 */
export class ReaderHandlerAgent extends BaseAgent {
  getTaskType() {
    return 'reader_handler' as const;
  }

  getPromptFileName(): string {
    return 'reader-handler.md';
  }

  async execute(task: AgentTask): Promise<AgentResult> {
    const startTime = Date.now();
    const taskId = task.id;

    try {
      const page = this.browser.getActivePage();
      this.logAction('Reading content...');

      // Extract content
      const context = await this.getPageContext(3000);

      // Ask LLM to summarize / verify understanding
      const summary = await this.think(
        `${context}

Please read and understand this content. Provide a brief 1-2 sentence summary of the key concepts.`
      );

      this.logAction('Content summary', summary);

      // Scroll to bottom to mark as read
      const scrollResult = await browserTools.scroll(page, {
        direction: 'down',
        amount: 10,
      });

      // Look for next button
      await new Promise((resolve) => setTimeout(resolve, 1000));

      const nextButton = await browserTools.checkElement(page, {
        selector: 'button[aria-label*="next"], .btn-next, [class*="next-button"]',
      });

      if (nextButton.data?.visible) {
        this.logAction('Found next button, clicking...');
        await browserTools.click(page, {
          selector: 'button[aria-label*="next"], .btn-next, [class*="next-button"]',
        });
      }

      return {
        success: true,
        taskId,
        action: 'reading_completed',
        message: 'Content read and understood',
        data: {
          summary,
        },
        durationMs: Date.now() - startTime,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      logger.error({ error }, 'Reader agent error');

      return {
        success: false,
        taskId,
        error: errorMsg,
        message: `Failed to read content: ${errorMsg}`,
        durationMs: Date.now() - startTime,
      };
    }
  }
}
