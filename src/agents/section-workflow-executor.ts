import { Page } from 'playwright';
import { CourseStructurePattern } from './course-structure-analyzer.js';
import * as browserTools from '../browser-tools/index.js';
import { getLogger } from '../utils/logger.js';

const logger = getLogger();

export interface WorkflowStep {
    type: 'navigate' | 'click' | 'wait' | 'verify' | 'submit';
    selector?: string;
    target?: string;
    description: string;
    optional?: boolean;
}

export interface SectionCompletion {
    sectionName: string;
    workflowSteps: WorkflowStep[];
    completionState: 'immediate' | 'pending_sync' | 'needs_verification';
    verificationInstructions: string;
    userMessage: string; // What to tell user
}

/**
 * SectionWorkflowExecutor - Guides execution of per-section workflow
 * Takes entire course pattern + individual section context
 * Outputs step-by-step workflow for that section
 *
 * Handles:
 * - Single-page completion (explicit button)
 * - Multi-page workflows (navigate → complete inner page)
 * - Async completion tracking (marked but not synced)
 * - User communication (what to do, what to expect)
 */
export class SectionWorkflowExecutor {
    private llmProvider: any;

    constructor(llmProvider: any) {
        this.llmProvider = llmProvider;
    }

    /**
     * Generate workflow for completing a specific section
     */
    async generateSectionWorkflow(
        page: Page,
        sectionName: string,
        sectionIndex: number,
        coursePattern: CourseStructurePattern
    ): Promise<SectionCompletion> {
        const startTime = Date.now();
        logger.info(`[EXECUTOR] Generating workflow for section ${sectionIndex}: "${sectionName}"`);

        try {
            // Extract current page state + context
            const url = page.url();
            const title = await page.title();

            const domResult = await browserTools.content.extractDOMForLLM(page, {
                maxTokens: 2000,
                strategy: 'llm-friendly',
                includeInteractive: true,
            });

            const domHtml = domResult.data?.html || '';
            const interactiveElements = domResult.data?.interactiveElements || [];

            // Get page state
            const stateResult = await browserTools.detection.detectPageState(page);
            const pageState = stateResult.data?.state;

            // Ask AI to generate workflow for this section
            const workflow = await this.askAIForWorkflow(
                sectionName,
                sectionIndex,
                coursePattern,
                url,
                title,
                domHtml,
                pageState,
                interactiveElements
            );

            logger.info(`[EXECUTOR] Workflow generated with ${workflow.workflowSteps.length} steps`);
            logger.info(`[EXECUTOR] Completion state: ${workflow.completionState}`);
            logger.info(`[EXECUTOR] User message: ${workflow.userMessage}`);

            return workflow;
        } catch (error) {
            logger.error({ error }, `[EXECUTOR] Failed to generate workflow for section ${sectionIndex}`);
            throw error;
        }
    }

    /**
     * Ask AI to generate step-by-step workflow
     */
    private async askAIForWorkflow(
        sectionName: string,
        sectionIndex: number,
        coursePattern: CourseStructurePattern,
        currentUrl: string,
        pageTitle: string,
        domHtml: string,
        pageState: any,
        interactiveElements: any[]
    ): Promise<SectionCompletion> {
        const prompt = `You are helping a user complete a course section. Based on the course workflow pattern and current page state, generate step-by-step instructions.

## Course Pattern (understood from earlier analysis)
- Structure: ${coursePattern.courseStructure.type} (${coursePattern.courseStructure.description})
- Completion Pattern: ${coursePattern.completionPattern.type} (${coursePattern.completionPattern.description})
- Navigation: ${coursePattern.navigationPattern.stayOnPage ? 'single-page' : 'multi-page'} workflow
- Async Completion: ${coursePattern.asyncCompletion.isAsync ? `Yes, ~${coursePattern.asyncCompletion.estimatedSyncTime}` : 'No, immediate'}

## Current Section
- Name: "${sectionName}"
- Index: ${sectionIndex}
- Current URL: ${currentUrl}

## Current Page State
- Video present: ${pageState?.hasVideo || false}
- Quiz/form present: ${pageState?.hasQuiz || false}
- Navigation UI present: ${pageState?.hasNavigation || false}
- Page title: "${pageTitle}"

## Interactive Elements Available
${interactiveElements
                .slice(0, 20)
                .map((el: any) => `- ${el.type}: "${el.text}" [${el.selector}]`)
                .join('\n')}

## Current Page DOM (snippet)
\`\`\`
${domHtml.substring(0, 1500)}
\`\`\`

## Task
Generate a workflow to COMPLETE this section:

1. If single-page (stayOnPage: true):
   - If explicit pattern: Find and create step to click "Mark Complete" / "Finish" button
   - If implicit pattern: Take action (watch video? submit form?) that triggers completion
   - Return immediate completion state

2. If multi-page (stayOnPage: false):
   - Find the link to navigate to section/assignment
   - Generate sub-steps for inner page (based on completionPattern)
   - Be aware: completion happen on INNER page, may need to return to verify
   - Return pending_sync state with verification instructions

3. If async (isAsync: true):
   - After marking complete on inner page, inform user it may take time to sync
   - Return pending_sync state with expected wait time + re-check instructions
   - User message should explain the delay

4. Always include user message explaining what to expect

## Response Format
Return ONLY valid JSON:
\`\`\`json
{
  "sectionName": "string",
  "workflowSteps": [
    {
      "type": "navigate|click|wait|verify|submit",
      "selector": "CSS selector or null",
      "target": "URL or target info",
      "description": "Human readable action"
    }
  ],
  "completionState": "immediate|pending_sync|needs_verification",
  "verificationInstructions": "How to verify completion (e.g., check progress bar, look for checkmark)",
  "userMessage": "Message to show user (e.g., 'Section marked complete! Next section will unlock in a few seconds.', or 'Assignment submitted! Please wait 24h for admin review.')"
}
\`\`\`

## Step Types
- **navigate**: Go to a URL (e.g., click section link)
- **click**: Click a button/element
- **wait**: Wait for something (e.g., element appears, page loads)
- **verify**: Check if completion was successful
- **submit**: Submit a form

Be specific with selectors. Only use selectors that ACTUALLY appear in the interactive elements list.`;

        try {
            const response = await this.llmProvider.chat([
                {
                    role: 'user',
                    content: prompt,
                },
            ]);

            const responseText = response.content;

            // Parse JSON
            const jsonMatch = responseText.match(/\{[\s\S]*\}/);
            if (!jsonMatch) {
                logger.error('[EXECUTOR] Could not extract JSON from response');
                throw new Error('Failed to parse AI workflow');
            }

            const workflow = JSON.parse(jsonMatch[0]) as SectionCompletion;
            return workflow;
        } catch (error) {
            logger.error({ error }, '[EXECUTOR] AI workflow generation failed');
            throw error;
        }
    }
}
