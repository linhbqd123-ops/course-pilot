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

export interface CompletionSignals {
  hasCompletionText: boolean; // Regex: "completed|finished|done|success|passed|congratulations"
  completionTextSnippet?: string;
  progressPercent?: number; // From aria-valuenow or width %
  hasNextButton: boolean; // Button exists to go to next section
  nextButtonEnabled: boolean;
  hasMarkCompleteButton: boolean; // Explicit "Mark Complete" / "Finish" button
  markCompleteButtonEnabled: boolean;
  hasVideoElement: boolean;
  videoCompleted?: boolean; // True if video duration == current time or 100% watched
  hasQuizForm: boolean;
  quizSubmitted?: boolean; // True if quiz success message shown
  estimatedCompletion: number; // 0-1 weighted score based on signals
}

/**
 * Collect completion signals (transparent facts, no interpretation).
 * Facts only - no AI needed. AI decides if these signals = "done".
 */
export async function collectCompletionSignals(page: Page): Promise<CompletionSignals> {
  try {
    const signals = await page.evaluate(() => {
      const bodyText = document.body.innerText || '';

      // Transparent checks only
      const completionPattern = /completed?|finished?|done|success|passed|congratulations/i;
      const hasCompletionText = completionPattern.test(bodyText);
      const completionMatch = bodyText.match(completionPattern);
      const completionTextSnippet = completionMatch ? completionMatch[0] : undefined;

      // Progress bar - transparent parse
      let progressPercent: number | undefined;
      const progressEl = document.querySelector('[role="progressbar"]');
      if (progressEl && progressEl.hasAttribute('aria-valuenow')) {
        const val = parseFloat(progressEl.getAttribute('aria-valuenow') || '0');
        progressPercent = Math.min(100, val);
      }

      // Buttons - just existence + state, no interpretation
      const nextButton = document.querySelector('[aria-label*="next"], [class*="next-button"]');
      const markButton = document.querySelector('button[aria-label*="mark complete"], button[aria-label*="finish"], button[aria-label*="complete"]');

      // Video check
      const hasVideoElement = !!document.querySelector('video, iframe[src*="youtube.com"], iframe[src*="vimeo.com"]');

      // Quiz check
      const hasQuizForm = !!document.querySelector('form, .quiz, [class*="quiz"], [data-question]');
      const quizSuccessPattern = /successful|submitted|graded|passed/i;
      const quizSubmitted = quizSuccessPattern.test(bodyText);

      return {
        hasCompletionText,
        completionTextSnippet,
        progressPercent,
        hasNextButton: !!nextButton,
        nextButtonEnabled: nextButton ? !(nextButton as HTMLButtonElement).disabled : false,
        hasMarkCompleteButton: !!markButton,
        markCompleteButtonEnabled: markButton ? !(markButton as HTMLButtonElement).disabled : false,
        hasVideoElement,
        hasQuizForm,
        quizSubmitted,
      };
    });

    // Calculate weighted score (transparent heuristic, but interpretation is AI's job)
    let score = 0;
    if (signals.hasCompletionText) score += 0.4;
    if (signals.progressPercent === 100) score += 0.3;
    if (signals.hasMarkCompleteButton && !signals.markCompleteButtonEnabled) score += 0.1; // Lowered: disabled button is weak signal
    if (signals.quizSubmitted) score += 0.2;

    logger.info(`[CLASSIFIER] Completion signals collected: text=${signals.hasCompletionText}, progress=${signals.progressPercent}%, quizSubmitted=${signals.quizSubmitted}, score=${(score).toFixed(2)}`);

    return {
      ...signals,
      estimatedCompletion: Math.min(1, score),
    };
  } catch (error) {
    logger.error({ error }, 'Error collecting completion signals');
    return {
      hasCompletionText: false,
      progressPercent: 0,
      hasNextButton: false,
      nextButtonEnabled: false,
      hasMarkCompleteButton: false,
      markCompleteButtonEnabled: false,
      hasVideoElement: false,
      hasQuizForm: false,
      quizSubmitted: false,
      estimatedCompletion: 0,
    };
  }
}
