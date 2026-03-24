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

export async function click(
  page: Page,
  input: ClickToolInput
): Promise<ToolOutput<ClickResult>> {
  const startTime = Date.now();

  try {
    const { selector, scrollIntoView = true, waitForNavigation = false } = input;

    // Scroll into view if requested
    if (scrollIntoView) {
      await page.locator(selector).scrollIntoViewIfNeeded({ timeout: input.timeout || 5000 });
    }

    // Wait for element to be visible
    await page.locator(selector).waitFor({ state: 'visible', timeout: input.timeout || 5000 });

    // Click with options
    await page.locator(selector).click({
      button: input.button || 'left',
      clickCount: input.clickCount || 1,
      delay: input.delay || 0,
    });

    // Handle navigation if expected
    let newUrl: string | undefined;
    if (waitForNavigation) {
      try {
        await page.waitForLoadState('networkidle', { timeout: input.timeout || 30000 });
        newUrl = page.url();
      } catch {
        newUrl = page.url();
      }
    }

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
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Click failed',
      duration: Date.now() - startTime,
    };
  }
}

export async function type(
  page: Page,
  input: TypeToolInput
): Promise<ToolOutput<{ typed: boolean }>> {
  const startTime = Date.now();

  try {
    const { selector, text, clear = false, delay = 0 } = input;

    const locator = page.locator(selector);
    await locator.waitFor({ state: 'visible', timeout: input.timeout || 5000 });

    if (clear) {
      await locator.clear();
    }

    await locator.type(text, { delay });

    return {
      success: true,
      data: { typed: true },
      duration: Date.now() - startTime,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Type failed',
      duration: Date.now() - startTime,
    };
  }
}

export async function navigate(
  page: Page,
  input: NavigateToolInput
): Promise<ToolOutput<NavigationResult>> {
  const startTime = Date.now();

  try {
    const { url, waitUntil = 'networkidle' } = input;

    await page.goto(url, {
      waitUntil,
      timeout: input.timeout || 60000,
    });

    return {
      success: true,
      data: {
        success: true,
        currentUrl: page.url(),
        pageTitle: await page.title(),
      },
      duration: Date.now() - startTime,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Navigation failed',
      duration: Date.now() - startTime,
    };
  }
}

export async function scroll(
  page: Page,
  input: ScrollToolInput
): Promise<ToolOutput<{ scrolled: boolean }>> {
  const startTime = Date.now();

  try {
    const { direction, amount = 3, selector } = input;

    const scrollAmount = amount * 100; // Pixel amount per "click"

    if (selector) {
      // Scroll within specific element
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

    return {
      success: true,
      data: { scrolled: true },
      duration: Date.now() - startTime,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Scroll failed',
      duration: Date.now() - startTime,
    };
  }
}

export async function waitForNavigation(
  page: Page,
  timeout: number = 30000
): Promise<ToolOutput<{ urlAfter: string }>> {
  const startTime = Date.now();

  try {
    await page.waitForLoadState('networkidle', { timeout });

    return {
      success: true,
      data: { urlAfter: page.url() },
      duration: Date.now() - startTime,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Wait for navigation timeout',
      duration: Date.now() - startTime,
    };
  }
}

export async function goBack(page: Page): Promise<ToolOutput<{ success: boolean }>> {
  const startTime = Date.now();

  try {
    await page.goBack({ waitUntil: 'networkidle', timeout: 30000 });

    return {
      success: true,
      data: { success: true },
      duration: Date.now() - startTime,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Go back failed',
      duration: Date.now() - startTime,
    };
  }
}

export async function goForward(page: Page): Promise<ToolOutput<{ success: boolean }>> {
  const startTime = Date.now();

  try {
    await page.goForward({ waitUntil: 'networkidle', timeout: 30000 });

    return {
      success: true,
      data: { success: true },
      duration: Date.now() - startTime,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Go forward failed',
      duration: Date.now() - startTime,
    };
  }
}
