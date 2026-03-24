import { chromium, BrowserContext, Page, Browser } from 'playwright';
import * as path from 'path';
import { BrowserConfig } from '../config/schema.js';
import { getLogger } from '../utils/logger.js';

const logger = getLogger();

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
   * Initialize browser with persistent profile
   */
  async initialize(): Promise<void> {
    try {
      logger.info(`Initializing browser with profile: ${this.profilePath}`);

      this.browser = await chromium.launchPersistentContext(this.profilePath, {
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
      if (this.browser.pages && this.browser.pages().length > 0) {
        this.page = this.browser.pages()[0];
      } else {
        this.page = await this.browser.newPage();
      }

      this.context = this.browser as unknown as BrowserContext;

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
   * Navigate to URL
   */
  async navigateTo(url: string, waitUntil: 'load' | 'domcontentloaded' | 'networkidle' = 'networkidle'): Promise<string> {
    const page = this.getActivePage();

    try {
      await page.goto(url, {
        waitUntil,
        timeout: this.config.navigationTimeout,
      });

      return page.url();
    } catch (error) {
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
