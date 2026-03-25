import { Page } from 'playwright';
import * as browserTools from '../browser-tools/index.js';
import { getLogger } from '../utils/logger.js';

const logger = getLogger();

export interface CourseStructurePattern {
    courseStructure: {
        type: 'sequential' | 'parallel' | 'mixed';
        description: string;
        totalSections: number;
        sectionOrganization: string;
    };
    completionPattern: {
        type: 'explicit' | 'implicit' | 'workflow';
        markers: string[];
        description: string;
    };
    navigationPattern: {
        stayOnPage: boolean;
        description: string;
        requiresInnerPageCompletion: boolean;
        innerPageBehavior: string;
    };
    asyncCompletion: {
        isAsync: boolean;
        description: string;
        estimatedSyncTime: string | null;
    };
    expectedBehavior: {
        afterMarkingComplete: string;
        howToVerifyCompletion: string;
    };
    recommendations: string[];
}

/**
 * CourseStructureAnalyzer - Understands HOW a course works
 * Reads course overview page ONCE to infer:
 * - Section organization (sequential/parallel)
 * - Completion patterns (explicit button? implicit auto-completion? workflow?)
 * - Navigation (single page or multi-page?)
 * - Async completion (immediate or takes time to sync?)
 *
 * This is THE ONE AI CALL that unlocks understanding for entire course
 */
export class CourseStructureAnalyzer {
    private llmProvider: any;

    constructor(llmProvider: any) {
        this.llmProvider = llmProvider;
    }

    /**
     * Analyze the course structure once at initialization
     */
    async analyzeCoursePage(page: Page, courseTitle: string): Promise<CourseStructurePattern> {
        const startTime = Date.now();
        logger.info('[COURSE_ANALYZER] Starting course structure analysis...');

        try {
            // Extract all information from course page
            const url = page.url();
            const title = await page.title();

            // Get DOM
            const domResult = await browserTools.content.extractDOMForLLM(page, {
                maxTokens: 3000,
                strategy: 'llm-friendly',
                includeInteractive: true,
            });

            const domHtml = domResult.data?.html || '';
            const textContent = domResult.data?.text || '';
            const interactiveElements = domResult.data?.interactiveElements || [];

            // Extract section names from page
            const sectionNames = await this.extractSectionNames(page);
            logger.info(`[COURSE_ANALYZER] Found ${sectionNames.length} sections: ${sectionNames.slice(0, 5).join(', ')}...`);

            // Ask AI to interpret this course's patterns
            const pattern = await this.askAIForPattern(
                url,
                courseTitle,
                title,
                domHtml,
                textContent,
                sectionNames,
                interactiveElements
            );

            logger.info(`[COURSE_ANALYZER] Course pattern identified:`);
            logger.info(`  - Structure: ${pattern.courseStructure.type}`);
            logger.info(`  - Completion: ${pattern.completionPattern.type}`);
            logger.info(`  - Navigation: ${pattern.navigationPattern.stayOnPage ? 'single-page' : 'multi-page'}`);
            logger.info(`  - Async: ${pattern.asyncCompletion.isAsync ? `yes (${pattern.asyncCompletion.estimatedSyncTime})` : 'no'}`);
            logger.info(`[COURSE_ANALYZER] Recommendations: ${pattern.recommendations.slice(0, 2).join(' | ')}`);

            return pattern;
        } catch (error) {
            logger.error({ error }, '[COURSE_ANALYZER] Failed to analyze course');
            throw error;
        }
    }

    /**
     * Extract section names from course page
     */
    private async extractSectionNames(page: Page): Promise<string[]> {
        try {
            const names = await page.evaluate(() => {
                const sections: string[] = [];

                // Common section selectors
                const selectors = [
                    'h2, h3',
                    '.section-title',
                    '[class*="module"]',
                    '[class*="lesson"]',
                    '[class*="chapter"]',
                    '.course-section-title',
                    'li[class*="section"] > span',
                ];

                for (const selector of selectors) {
                    const elements = document.querySelectorAll(selector);
                    if (elements.length === 0) continue;

                    for (const el of Array.from(elements)) {
                        const text = el.textContent?.trim() || '';
                        if (text.length > 5 && text.length < 200 && !text.includes('\n')) {
                            sections.push(text);
                        }
                    }

                    if (sections.length > 2) break; // Found likely section list
                }

                return sections;
            });

            return names.slice(0, 20); // Max 20 sections to analyze
        } catch (error) {
            logger.warn({ error }, '[COURSE_ANALYZER] Failed to extract section names');
            return [];
        }
    }

    /**
     * Ask AI to interpret course patterns
     */
    private async askAIForPattern(
        url: string,
        courseTitle: string,
        pageTitle: string,
        domHtml: string,
        textContent: string,
        sectionNames: string[],
        interactiveElements: any[]
    ): Promise<CourseStructurePattern> {
        const prompt = `You are analyzing a course platform page to understand how this specific course works.

## Page Information
- URL: ${url}
- Course Title: ${courseTitle}
- Page Title: ${pageTitle}

## Course Sections Found
${sectionNames.map((name, i) => `${i + 1}. ${name}`).join('\n')}

## Interactive Elements (actions available)
${interactiveElements
                .slice(0, 15)
                .map((el: any) => `- ${el.type}: "${el.text}" [${el.selector}]`)
                .join('\n')}

## Simplified Course Page DOM
\`\`\`
${domHtml.substring(0, 2000)}
\`\`\`

## Text Content (preview)
\`\`\`
${textContent.substring(0, 1500)}
\`\`\`

## Task
Based on the page structure, sections, and content, infer the course workflow pattern:

1. **courseStructure**: Are sections sequential (must do in order)? Parallel (any order)? Mixed?
2. **completionPattern**: How does "section complete" manifest? 
   - explicit = clear "Mark Complete" button
   - implicit = auto-completes (progress 100%, video ends)
   - workflow = must follow steps (navigate+do work)
3. **navigationPattern**: Single page (everything on main course page) or multi-page (click section link → navigate)?
4. **asyncCompletion**: Does completion update immediately or take time (3-4 days)?
5. **recommendations**: Practical hints for navigating THIS course

Return ONLY valid JSON (no markdown wrapper):
\`\`\`json
{
  "courseStructure": { "type": "...", "description": "...", "totalSections": ..., "sectionOrganization": "..." },
  "completionPattern": { "type": "...", "markers": [...], "description": "..." },
  "navigationPattern": { "stayOnPage": boolean, "description": "...", "requiresInnerPageCompletion": boolean, "innerPageBehavior": "..." },
  "asyncCompletion": { "isAsync": boolean, "description": "...", "estimatedSyncTime": "..." },
  "expectedBehavior": { "afterMarkingComplete": "...", "howToVerifyCompletion": "..." },
  "recommendations": [...]
}
\`\`\`

IMPORTANT: Be specific about what you see, don't hallucinate. If unsure about a pattern, mark it as ambiguous in description.`;

        try {
            const response = await this.llmProvider.chat([
                {
                    role: 'user',
                    content: prompt,
                },
            ]);

            const responseText = response.content;
            logger.debug(`[COURSE_ANALYZER] AI response length: ${responseText.length}`);

            // Parse JSON
            const jsonMatch = responseText.match(/\{[\s\S]*\}/);
            if (!jsonMatch) {
                logger.error('[COURSE_ANALYZER] Could not extract JSON from response');
                throw new Error('Failed to parse AI response');
            }

            const pattern = JSON.parse(jsonMatch[0]) as CourseStructurePattern;
            return pattern;
        } catch (error) {
            logger.error({ error }, '[COURSE_ANALYZER] AI analysis failed');
            throw error;
        }
    }
}
