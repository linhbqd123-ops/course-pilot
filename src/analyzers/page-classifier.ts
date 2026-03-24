import { Page } from 'playwright';
import * as browserTools from '../browser-tools/index.js';
import { getLogger } from '../utils/logger.js';

const logger = getLogger();

export type PageType = 'video' | 'quiz' | 'reading' | 'navigation' | 'unknown';

export interface PageClassification {
  type: PageType;
  confidence: number;
  indicators: string[];
  metadata?: Record<string, any>;
}

/**
 * Classify page type using heuristics
 */
export async function classifyPage(page: Page): Promise<PageClassification> {
  const indicators: string[] = [];
  let videoScore = 0;
  let quizScore = 0;
  let navigationScore = 0;
  let readingScore = 0;

  try {
    // Get page state
    const stateResult = await browserTools.detectPageState(page);
    const state = stateResult.data?.state;

    if (!state) {
      return {
        type: 'unknown',
        confidence: 0,
        indicators: ['failed to detect page state'],
      };
    }

    if (state.hasVideo) {
      videoScore += 5;
      indicators.push('video element detected');
    }

    if (state.hasQuiz) {
      quizScore += 5;
      indicators.push('quiz elements detected');
    }

    if (state.hasNavigation) {
      navigationScore += 3;
      indicators.push('navigation elements detected');
    }

    if (state.hasCompletionMessage) {
      indicators.push('completion message detected');
    }

    // Additional heuristics
    const domResult = await browserTools.extractDOMForLLM(page, { maxTokens: 2000 });
    const html = domResult.data?.html || '';

    // Check for video player patterns
    if (html.match(/video|player|youtube|vimeo/i)) {
      videoScore += 2;
      indicators.push('video keywords in content');
    }

    // Check for quiz patterns
    if (html.match(/question|quiz|answer|submit|multiple.?choice|option\"|<input.*type=["\']radio|<input.*type=["\']checkbox/i)) {
      quizScore += 2;
      indicators.push('quiz keywords in content');
    }

    // Check for reading material
    const textLength = domResult.data?.text?.length || 0;
    if (textLength > 1000 && !state.hasVideo) {
      readingScore += 2;
      indicators.push('substantial text content');
    }

    // Determine page type
    const scores = {
      video: videoScore,
      quiz: quizScore,
      navigation: navigationScore,
      reading: readingScore,
    };

    let maxScore = 0;
    let pageType: PageType = 'unknown';

    for (const [type, score] of Object.entries(scores)) {
      if (score > maxScore) {
        maxScore = score;
        pageType = type as PageType;
      }
    }

    const totalScore = Object.values(scores).reduce((a, b) => a + b, 0);
    const confidence = totalScore > 0 ? maxScore / totalScore : 0;

    return {
      type: pageType,
      confidence,
      indicators,
    };
  } catch (error) {
    logger.error({ error }, 'Error classifying page');
    return {
      type: 'unknown',
      confidence: 0,
      indicators: [`error: ${error instanceof Error ? error.message : 'unknown'}`],
    };
  }
}

/**
 * Extract course structure from course overview page
 */
export async function extractCourseStructure(
  page: Page
): Promise<{
  sections: Array<{ name: string; url?: string }>;
  totalSections: number;
}> {
  try {
    const structure = await page.evaluate(() => {
      const sections: any[] = [];

      // Common section selectors
      const sectionSelectors = [
        '.module',
        '.lesson',
        '.section',
        '[class*="chapter"]',
        'li[class*="module"]',
        'div[class*="course-section"]',
      ];

      for (const selector of sectionSelectors) {
        const elements = document.querySelectorAll(selector);
        if (elements.length === 0) continue;

        elements.forEach((el) => {
          const nameEl = el.querySelector('h2, h3, h4, .title, [class*="name"]');
          const linkEl = el.querySelector('a[href]');

          const name = nameEl?.textContent?.trim() || el.textContent?.trim()?.substring(0, 100) || '';
          const url = linkEl?.getAttribute('href');

          if (name) {
            sections.push({ name, url });
          }
        });

        if (sections.length > 0) break;
      }

      return {
        sections,
        totalSections: sections.length,
      };
    });

    return structure;
  } catch (error) {
    logger.warn({ error }, 'Error extracting course structure');
    return { sections: [], totalSections: 0 };
  }
}

/**
 * Detect if current section is completed
 */
export async function detectCompletion(page: Page): Promise<boolean> {
  try {
    const isCompleted = await page.evaluate(() => {
      const patterns = [
        /completed?|finished?|done|success|passed|congratulations/i,
        /next.*section|continue|go.*to.*next/i,
      ];

      const bodyText = document.body.innerText || '';
      const htmlText = document.body.innerHTML || '';

      for (const pattern of patterns) {
        if (pattern.test(bodyText)) {
          return true;
        }
      }

      // Check for disabled next button (indicates completion)
      const nextButtons = document.querySelectorAll('[aria-label*="next"], [class*="next-button"], button[aria-label*="mark complete"]');
      for (const btn of nextButtons) {
        if ((btn as HTMLButtonElement).disabled) {
          return true;
        }
      }

      return false;
    });

    return isCompleted;
  } catch (error) {
    logger.error({ error }, 'Error detecting completion');
    return false;
  }
}
