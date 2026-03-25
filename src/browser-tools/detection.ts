import { Page } from 'playwright';
import { PageStateInfo, CheckElementToolInput, WaitForStateToolInput, ToolOutput } from './types.js';
import { getLogger } from '../utils/logger.js';

const logger = getLogger();

export async function detectPageState(
  page: Page
): Promise<ToolOutput<{ state: PageStateInfo }>> {
  const startTime = Date.now();
  logger.info(`[DETECTION] Analyzing page state...`);

  try {
    const state = await page.evaluate(() => {
      const indicators: string[] = [];
      let hasQuiz = false;
      let hasVideo = false;
      let hasNavigation = false;
      let hasCompletionMessage = false;

      // Check for video
      if (document.querySelector('video')) {
        hasVideo = true;
        indicators.push('video element found');
      }

      if (document.querySelector('iframe[src*="youtube.com"], iframe[src*="vimeo.com"]')) {
        hasVideo = true;
        indicators.push('video iframe found');
      }

      // Check for quiz/form
      const quizSelectors = [
        'form',
        '.quiz',
        '[class*="quiz"]',
        '[data-question]',
        '.question',
      ];

      for (const sel of quizSelectors) {
        if (document.querySelector(sel)) {
          hasQuiz = true;
          indicators.push('quiz element found');
          break;
        }
      }

      // Check for navigation elements
      const navSelectors = [
        'nav',
        '.navigation',
        '.sidebar',
        '[class*="toc"]',
        '[class*="menu"]',
      ];

      for (const sel of navSelectors) {
        if (document.querySelector(sel)) {
          hasNavigation = true;
          indicators.push('navigation element found');
          break;
        }
      }

      // Check for completion messages
      const completionPatterns = [
        /completed|finished|done|success|passed/i,
        /congratulations|well done/i,
      ];

      const bodyText = document.body.innerText || '';
      for (const pattern of completionPatterns) {
        if (pattern.test(bodyText)) {
          hasCompletionMessage = true;
          indicators.push('completion message detected');
          break;
        }
      }

      // Determine page type
      let estimatedPageType: 'video' | 'quiz' | 'reading' | 'navigation' | 'unknown' =
        'unknown';

      if (hasVideo) {
        estimatedPageType = 'video';
      } else if (hasQuiz) {
        estimatedPageType = 'quiz';
      } else if (hasNavigation) {
        estimatedPageType = 'navigation';
      } else if (bodyText.length > 500) {
        estimatedPageType = 'reading';
      }

      return {
        hasQuiz,
        hasVideo,
        hasNavigation,
        hasCompletionMessage,
        estimatedPageType,
        indicators,
      };
    });

    logger.info(`[DETECTION] Page type detected: ${state.estimatedPageType}. Indicators: ${state.indicators.join(', ')}`);

    return {
      success: true,
      data: { state },
      duration: Date.now() - startTime,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Detect page state failed';
    logger.error(`[DETECTION] Page state detection failed: ${errorMsg}`);
    return {
      success: false,
      error: errorMsg,
      duration: Date.now() - startTime,
      data: {
        state: {
          hasQuiz: false,
          hasVideo: false,
          hasNavigation: false,
          hasCompletionMessage: false,
          estimatedPageType: 'unknown',
          indicators: [],
        },
      },
    };
  }
}

export async function checkElement(
  page: Page,
  input: CheckElementToolInput
): Promise<ToolOutput<{ exists: boolean; visible: boolean; enabled: boolean }>> {
  const startTime = Date.now();
  logger.info(`[DETECTION] Checking element: ${input.selector}${input.state ? ` (state: ${input.state})` : ''}`);

  try {
    const { selector, state } = input;

    const locator = page.locator(selector);
    let exists = await locator.count().then((count) => count > 0);

    if (!exists) {
      logger.warn(`[DETECTION] Element not found: ${selector}`);
      return {
        success: true,
        data: { exists: false, visible: false, enabled: false },
        duration: Date.now() - startTime,
      };
    }

    let visible = false;
    let enabled = false;

    try {
      visible = await locator.isVisible({ timeout: 1000 });
    } catch {
      visible = false;
    }

    try {
      enabled = await locator.isEnabled({ timeout: 1000 });
    } catch {
      enabled = false;
    }

    logger.info(`[DETECTION] Element found - Visible: ${visible}, Enabled: ${enabled}`);

    // If specific state requested
    if (state === 'visible' && !visible) {
      logger.warn(`[DETECTION] Element not visible`);
      return {
        success: false,
        error: 'Element not visible',
        duration: Date.now() - startTime,
        data: { exists, visible, enabled },
      };
    }

    if (state === 'hidden' && visible) {
      logger.warn(`[DETECTION] Element is visible (expected hidden)`);
      return {
        success: false,
        error: 'Element is visible',
        duration: Date.now() - startTime,
        data: { exists, visible, enabled },
      };
    }

    if (state === 'enabled' && !enabled) {
      logger.warn(`[DETECTION] Element not enabled`);
      return {
        success: false,
        error: 'Element not enabled',
        duration: Date.now() - startTime,
        data: { exists, visible, enabled },
      };
    }

    if (state === 'disabled' && enabled) {
      logger.warn(`[DETECTION] Element is enabled (expected disabled)`);
      return {
        success: false,
        error: 'Element is enabled',
        duration: Date.now() - startTime,
        data: { exists, visible, enabled },
      };
    }

    return {
      success: true,
      data: { exists, visible, enabled },
      duration: Date.now() - startTime,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Check element failed';
    logger.error(`[DETECTION] Check element failed: ${errorMsg}`);
    return {
      success: false,
      error: errorMsg,
      duration: Date.now() - startTime,
      data: { exists: false, visible: false, enabled: false },
    };
  }
}

export async function waitForElement(
  page: Page,
  input: WaitForStateToolInput
): Promise<ToolOutput<{ reached: boolean }>> {
  const startTime = Date.now();
  const maxWait = input.maxWaitTime || 30000;
  logger.info(`[DETECTION] Waiting for element: ${input.selector} (state: ${input.state}, timeout: ${maxWait}ms)`);

  try {
    const { selector, state } = input;
    const locator = page.locator(selector);

    if (state === 'visible') {
      await locator.waitFor({ state: 'visible', timeout: maxWait });
    } else if (state === 'hidden') {
      await locator.waitFor({ state: 'hidden', timeout: maxWait });
    } else if (state === 'enabled') {
      await locator.waitFor({ state: 'visible', timeout: maxWait });
      await locator.isEnabled({ timeout: maxWait });
    } else if (state === 'disabled') {
      await locator.waitFor({ state: 'visible', timeout: maxWait });
    }

    logger.info(`[DETECTION] Element reached desired state: ${state} (${Date.now() - startTime}ms)`);
    return {
      success: true,
      data: { reached: true },
      duration: Date.now() - startTime,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : `Element did not reach state: ${input.state}`;
    logger.warn(`[DETECTION] Wait for element timeout/failed: ${errorMsg}`);
    return {
      success: false,
      error: errorMsg,
      duration: Date.now() - startTime,
      data: { reached: false },
    };
  }
}

export async function detectProgress(
  page: Page
): Promise<ToolOutput<{ progress?: number; message?: string }>> {
  const startTime = Date.now();
  logger.info(`[DETECTION] Detecting progress indicator...`);

  try {
    const result = await page.evaluate(() => {
      const progressSelectors = [
        '[class*="progress"]',
        '[aria-label*="progress"]',
        '.progress-bar',
        '[role="progressbar"]',
      ];

      for (const sel of progressSelectors) {
        const el = document.querySelector(sel);
        if (!el) continue;

        // Try to extract percentage
        const ariaValueNow = el.getAttribute('aria-valuenow');
        if (ariaValueNow) {
          return { progress: parseFloat(ariaValueNow) / 100 };
        }

        const widthMatch = el.getAttribute('style')?.match(/width:\s*(\d+(?:\.\d+)?)/);
        if (widthMatch) {
          return { progress: parseFloat(widthMatch[1]) / 100 };
        }

        const text = el.textContent || '';
        const percentMatch = text.match(/(\d+(?:\.\d+)?)\s*%/);
        if (percentMatch) {
          return { progress: parseFloat(percentMatch[1]) / 100 };
        }

        return { message: text.trim() };
      }

      return { message: 'No progress element found' };
    });

    if (result.progress) {
      logger.info(`[DETECTION] Progress: ${(result.progress * 100).toFixed(1)}%`);
    } else {
      logger.info(`[DETECTION] Progress message: ${result.message}`);
    }

    return {
      success: true,
      data: result,
      duration: Date.now() - startTime,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Detect progress failed';
    logger.warn(`[DETECTION] Progress detection failed: ${errorMsg}`);
    return {
      success: false,
      error: errorMsg,
      duration: Date.now() - startTime,
    };
  }
}

export async function hover(
  page: Page,
  selector: string
): Promise<ToolOutput<{ hovered: boolean }>> {
  const startTime = Date.now();
  logger.info(`[DETECTION] Hovering over: ${selector}`);

  try {
    await page.locator(selector).hover();
    logger.info(`[DETECTION] Hover successful (${Date.now() - startTime}ms)`);

    return {
      success: true,
      data: { hovered: true },
      duration: Date.now() - startTime,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Hover failed';
    logger.error(`[DETECTION] Hover failed: ${errorMsg}`);
    return {
      success: false,
      error: errorMsg,
      duration: Date.now() - startTime,
    };
  }
}

export async function focus(
  page: Page,
  selector: string
): Promise<ToolOutput<{ focused: boolean }>> {
  const startTime = Date.now();
  logger.info(`[DETECTION] Focusing element: ${selector}`);

  try {
    await page.locator(selector).focus();
    logger.info(`[DETECTION] Focus successful (${Date.now() - startTime}ms)`);

    return {
      success: true,
      data: { focused: true },
      duration: Date.now() - startTime,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Focus failed';
    logger.error(`[DETECTION] Focus failed: ${errorMsg}`);
    return {
      success: false,
      error: errorMsg,
      duration: Date.now() - startTime,
    };
  }
}
