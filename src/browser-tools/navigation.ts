import { Page } from 'playwright';
import {
  ClickToolInput,
  ClickResult,
  NavigateToolInput,
  NavigationResult,
  TypeToolInput,
  ScrollToolInput,
  ToolOutput,
} from './types.js';
import { getLogger } from '../utils/logger.js';

const logger = getLogger();

export async function click(
  page: Page,
  input: ClickToolInput
): Promise<ToolOutput<ClickResult>> {
  const startTime = Date.now();
  logger.info(`[NAVIGATION] Clicking element: ${input.selector}`);

  try {
    const { selector, scrollIntoView = true, waitForNavigation = false } = input;

    // Scroll into view if requested
    if (scrollIntoView) {
      logger.info(`[NAVIGATION] Scrolling element into view...`);
      await page.locator(selector).scrollIntoViewIfNeeded({ timeout: input.timeout || 5000 });
    }

    // Wait for element to be visible
    logger.info(`[NAVIGATION] Waiting for element to be visible...`);
    await page.locator(selector).waitFor({ state: 'visible', timeout: input.timeout || 5000 });

    // Click with options
    logger.info(`[NAVIGATION] Performing click...`);
    await page.locator(selector).click({
      button: input.button || 'left',
      clickCount: input.clickCount || 1,
      delay: input.delay || 0,
    });

    // Handle navigation if expected
    let newUrl: string | undefined;
    if (waitForNavigation) {
      logger.info(`[NAVIGATION] Waiting for page navigation...`);
      try {
        await page.waitForLoadState('networkidle', { timeout: input.timeout || 30000 });
        newUrl = page.url();
        logger.info(`[NAVIGATION] Navigation completed. New URL: ${newUrl}`);
      } catch {
        newUrl = page.url();
        logger.warn(`[NAVIGATION] Navigation timeout, but page state: ${newUrl}`);
      }
    }

    logger.info(`[NAVIGATION] Click successful (${Date.now() - startTime}ms)`);
    return {
      success: true,
      data: {
        success: true,
        clicked: true,
        newUrl,
      },
      duration: Date.now() - startTime,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`[NAVIGATION] Click failed: ${errorMsg}`);
    return {
      success: false,
      error: errorMsg,
      duration: Date.now() - startTime,
    };
  }
}

export async function type(
  page: Page,
  input: TypeToolInput
): Promise<ToolOutput<{ typed: boolean }>> {
  const startTime = Date.now();
  logger.info(`[NAVIGATION] Typing into element: ${input.selector}`);

  try {
    const { selector, text, clear = false, delay = 0 } = input;

    const locator = page.locator(selector);
    logger.info(`[NAVIGATION] Waiting for element to be visible...`);
    await locator.waitFor({ state: 'visible', timeout: input.timeout || 5000 });

    if (clear) {
      logger.info(`[NAVIGATION] Clearing field before typing...`);
      await locator.clear();
    }

    logger.info(`[NAVIGATION] Typing text (${text.length} characters)...`);
    await locator.type(text, { delay });

    logger.info(`[NAVIGATION] Type successful (${Date.now() - startTime}ms)`);
    return {
      success: true,
      data: { typed: true },
      duration: Date.now() - startTime,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Type failed';
    logger.error(`[NAVIGATION] Type failed: ${errorMsg}`);
    return {
      success: false,
      error: errorMsg,
      duration: Date.now() - startTime,
    };
  }
}

export async function navigate(
  page: Page,
  input: NavigateToolInput
): Promise<ToolOutput<NavigationResult>> {
  const startTime = Date.now();
  logger.info(`[NAVIGATION] Navigating to: ${input.url}`);

  try {
    const { url, waitUntil = 'networkidle' } = input;

    logger.info(`[NAVIGATION] Waiting for page load (${waitUntil})...`);
    await page.goto(url, {
      waitUntil,
      timeout: input.timeout || 60000,
    });

    const finalUrl = page.url();
    const title = await page.title();
    logger.info(`[NAVIGATION] Page loaded successfully. Title: "${title}" (${Date.now() - startTime}ms)`);

    return {
      success: true,
      data: {
        success: true,
        currentUrl: finalUrl,
        pageTitle: title,
      },
      duration: Date.now() - startTime,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Navigation failed';
    logger.error(`[NAVIGATION] Navigation failed: ${errorMsg}`);
    return {
      success: false,
      error: errorMsg,
      duration: Date.now() - startTime,
    };
  }
}

export async function scroll(
  page: Page,
  input: ScrollToolInput
): Promise<ToolOutput<{ scrolled: boolean }>> {
  const startTime = Date.now();
  const target = input.selector ? `element: ${input.selector}` : 'page';
  logger.info(`[NAVIGATION] Scrolling ${target} - Direction: ${input.direction}, Amount: ${input.amount || 3}`);

  try {
    const { direction, amount = 3, selector } = input;

    const scrollAmount = amount * 100; // Pixel amount per "click"

    if (selector) {
      // Scroll within specific element
      logger.info(`[NAVIGATION] Scrolling within element...`);
      const locator = page.locator(selector);
      await locator.evaluate(
        (el, { direction, amount }) => {
          const scrollOptions =
            direction === 'up' || direction === 'left'
              ? { top: -amount, left: -amount }
              : { top: amount, left: amount };

          if (direction === 'up' || direction === 'down') {
            el.scrollBy({ top: direction === 'down' ? amount : -amount });
          } else {
            el.scrollBy({ left: direction === 'right' ? amount : -amount });
          }
        },
        { direction, amount: scrollAmount }
      );
    } else {
      // Scroll main page
      logger.info(`[NAVIGATION] Scrolling main page...`);
      if (direction === 'down' || direction === 'up') {
        await page.evaluate((amount) => {
          window.scrollBy(0, amount);
        }, direction === 'down' ? scrollAmount : -scrollAmount);
      } else {
        await page.evaluate((amount) => {
          window.scrollBy(amount, 0);
        }, direction === 'right' ? scrollAmount : -scrollAmount);
      }
    }

    logger.info(`[NAVIGATION] Scroll successful (${Date.now() - startTime}ms)`);
    return {
      success: true,
      data: { scrolled: true },
      duration: Date.now() - startTime,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Scroll failed';
    logger.error(`[NAVIGATION] Scroll failed: ${errorMsg}`);
    return {
      success: false,
      error: errorMsg,
      duration: Date.now() - startTime,
    };
  }
}

export async function waitForNavigation(
  page: Page,
  timeout: number = 30000
): Promise<ToolOutput<{ urlAfter: string }>> {
  const startTime = Date.now();
  logger.info(`[NAVIGATION] Waiting for navigation (timeout: ${timeout}ms)...`);

  try {
    await page.waitForLoadState('networkidle', { timeout });
    const finalUrl = page.url();
    logger.info(`[NAVIGATION] Navigation complete. URL: ${finalUrl} (${Date.now() - startTime}ms)`);

    return {
      success: true,
      data: { urlAfter: finalUrl },
      duration: Date.now() - startTime,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Wait for navigation timeout';
    logger.error(`[NAVIGATION] Wait for navigation failed: ${errorMsg}`);
    return {
      success: false,
      error: errorMsg,
      duration: Date.now() - startTime,
    };
  }
}

export async function goBack(page: Page): Promise<ToolOutput<{ success: boolean }>> {
  const startTime = Date.now();
  logger.info(`[NAVIGATION] Going back...`);

  try {
    await page.goBack({ waitUntil: 'networkidle', timeout: 30000 });
    logger.info(`[NAVIGATION] Go back successful (${Date.now() - startTime}ms)`);

    return {
      success: true,
      data: { success: true },
      duration: Date.now() - startTime,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Go back failed';
    logger.error(`[NAVIGATION] Go back failed: ${errorMsg}`);
    return {
      success: false,
      error: errorMsg,
      duration: Date.now() - startTime,
    };
  }
}

export async function goForward(page: Page): Promise<ToolOutput<{ success: boolean }>> {
  const startTime = Date.now();
  logger.info(`[NAVIGATION] Going forward...`);

  try {
    await page.goForward({ waitUntil: 'networkidle', timeout: 30000 });
    logger.info(`[NAVIGATION] Go forward successful (${Date.now() - startTime}ms)`);

    return {
      success: true,
      data: { success: true },
      duration: Date.now() - startTime,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Go forward failed';
    logger.error(`[NAVIGATION] Go forward failed: ${errorMsg}`);
    return {
      success: false,
      error: errorMsg,
      duration: Date.now() - startTime,
    };
  }
}
