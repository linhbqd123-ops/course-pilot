import { chromium, BrowserContext, Page, Browser } from 'playwright';
import * as path from 'path';
import { BrowserConfig } from '../config/schema.js';
import { getLogger } from '../utils/logger.js';

const logger = getLogger();

const DEFAULT_LOADER_SELECTORS = [
  '[aria-busy="true"]',
  'div[role="progressbar"]',
  '.loading',
  '.loader',
  '.spinner',
  '.loading-spinner',
  '.lds-ellipsis',
  '.spinner-icon',
  '.sk-spinner',
  '.v-loading',
  '.gl-spinner',
];

export class BrowserController {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private profilePath: string;
  private config: BrowserConfig;

  constructor(profilePath: string, config: BrowserConfig) {
    this.profilePath = profilePath;
    this.config = config;
  }

  /**
   * Wait for common loader/spinner elements to disappear.
   * This helps detect visual readiness on SPA sites that never reach "networkidle".
   */
  private async waitForLoaderGone(timeoutMs: number = 10000): Promise<void> {
    const page = this.getActivePage();
    const perSelectorTimeout = Math.max(1000, Math.min(timeoutMs, 10000));

    for (const selector of DEFAULT_LOADER_SELECTORS) {
      try {
        // Quick existence check
        const handle = await page.$(selector);
        if (!handle) continue;

        logger.info(`[BROWSER] Detected loader selector present: ${selector} — waiting up to ${perSelectorTimeout}ms for it to disappear`);
        await page.waitForSelector(selector, { state: 'hidden', timeout: perSelectorTimeout });
        logger.info(`[BROWSER] Loader ${selector} disappeared`);
        return;
      } catch (err) {
        // If waiting for this selector timed out, continue to next selector
        logger.debug({ err }, `[BROWSER] Loader ${selector} did not disappear within ${perSelectorTimeout}ms`);
        continue;
      }
    }

    // As a last resort, look for elements with inline spinner attributes
    try {
      // If nothing matched or disappeared, check for global busy markers briefly
      const busy = await page.$('[data-loading="true"]');
      if (busy) {
        await page.waitForSelector('[data-loading="true"]', { state: 'hidden', timeout: perSelectorTimeout });
      }
    } catch {
      // ignore
    }
  }

  /**
   * Initialize browser with persistent profile
   */
  async initialize(): Promise<void> {
    try {
      logger.info(`Initializing browser with profile: ${this.profilePath}`);

      this.context = await chromium.launchPersistentContext(this.profilePath, {
        headless: this.config.headless,
        args: [
          '--disable-blink-features=AutomationControlled',
          '--disable-dev-shm-usage',
        ],
        viewport: this.config.viewport,
        // Increase network timeout
        navigationTimeout: this.config.navigationTimeout,
        actionTimeout: this.config.timeout,
      } as any);

      // Get or create page
      const pages = this.context.pages();
      if (pages && pages.length > 0) {
        this.page = pages[0];
      } else {
        this.page = await this.context.newPage();
      }

      logger.info('Browser initialized successfully');
    } catch (error) {
      logger.error({ error }, 'Failed to initialize browser');
      throw error;
    }
  }

  /**
   * Get active page
   */
  getActivePage(): Page {
    if (!this.page) {
      throw new Error('Browser not initialized or no active page');
    }
    return this.page;
  }

  /**
   * Get browser context
   */
  getContext(): BrowserContext {
    if (!this.context) {
      throw new Error('Browser context not initialized');
    }
    return this.context;
  }

  /**
   * Create new page
   */
  async createPage(): Promise<Page> {
    if (!this.context) {
      throw new Error('Browser context not initialized');
    }

    const newPage = await this.context.newPage();
    this.page = newPage;
    return newPage;
  }

  /**
   * Navigate to URL with retry fallback
   */
  async navigateTo(url: string, waitUntil: 'load' | 'domcontentloaded' | 'networkidle' = 'networkidle'): Promise<string> {
    const page = this.getActivePage();
    const startTime = Date.now();

    try {
      logger.info(`[BROWSER] Navigating to: ${url}`);
      logger.info(`[BROWSER] Waiting for page load state: ${waitUntil} (timeout: ${this.config.navigationTimeout}ms)`);

      await page.goto(url, {
        waitUntil,
        timeout: this.config.navigationTimeout,
      });

      const finalUrl = page.url();
      logger.info(`[BROWSER] Navigation successful (${Date.now() - startTime}ms). URL: ${finalUrl}`);
      // After navigation, wait for any common loading/spinner indicators to disappear
      await this.waitForLoaderGone().catch((err) => {
        logger.info('[BROWSER] Loader wait skipped or timed out: ' + (err instanceof Error ? err.message : String(err)));
      });
      return finalUrl;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.warn(`[BROWSER] Navigation timeout on "${waitUntil}" strategy: ${errorMsg}`);

      // Retry with more lenient strategy
      if (waitUntil === 'networkidle') {
        logger.info(`[BROWSER] Retrying navigation with "load" strategy...`);
        try {
          await page.goto(url, {
            waitUntil: 'load',
            timeout: this.config.navigationTimeout,
          });

          const finalUrl = page.url();
          logger.info(`[BROWSER] Navigation successful with fallback (${Date.now() - startTime}ms). URL: ${finalUrl}`);
          // Wait for loader to disappear after fallback navigation
          await this.waitForLoaderGone().catch((err) => {
            logger.info('[BROWSER] Loader wait skipped or timed out (fallback): ' + (err instanceof Error ? err.message : String(err)));
          });
          return finalUrl;
        } catch (retryError) {
          const retryMsg = retryError instanceof Error ? retryError.message : String(retryError);
          logger.error(`[BROWSER] Navigation failed on both strategies: ${retryMsg}`);
          throw retryError;
        }
      }

      logger.error({ error }, `Navigation to ${url} failed`);
      throw error;
    }
  }

  /**
   * Wait for URL change
   */
  async waitForNavigation(waitUntil: 'load' | 'domcontentloaded' | 'networkidle' = 'networkidle'): Promise<string> {
    const page = this.getActivePage();

    try {
      await page.waitForLoadState(waitUntil, { timeout: this.config.navigationTimeout });
      return page.url();
    } catch (error) {
      logger.warn({ error }, 'Wait for navigation timeout');
      return page.url();
    }
  }

  /**
   * Close browser and cleanup
   */
  async close(): Promise<void> {
    try {
      if (this.page) {
        await this.page.close();
        this.page = null;
      }

      if (this.browser) {
        await this.browser.close();
        this.browser = null;
      }

      logger.info('Browser closed');
    } catch (error) {
      logger.error({ error }, 'Error closing browser');
    }
  }

  /**
   * Check if browser is still alive
   */
  isAlive(): boolean {
    return this.browser !== null && this.page !== null;
  }
}
