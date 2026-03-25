import { Page } from 'playwright';
import { collectCompletionSignals, CompletionSignals } from '../analyzers/page-classifier.js';
import * as browserTools from '../browser-tools/index.js';
import { getLogger } from '../utils/logger.js';

const logger = getLogger();

export interface CompletionEvaluation {
    isComplete: boolean;
    confidence: number; // 0-1
    reason: string;
    requiredActions?: Array<{
        type: 'click' | 'scroll' | 'play' | 'seek' | 'wait' | 'submit';
        selector?: string;
        description: string;
    }>;
}

/**
 * CompletionEvaluator - AI-based completion detection
 * Uses LLM to interpret completion signals + DOM context
 * Only transparent facts (signals) go to AI - no ambiguous heuristics
 */
export class CompletionEvaluator {
    private llmProvider: any; // Avoid circular dependency - use any for LLM instance

    constructor(llmProvider: any) {
        this.llmProvider = llmProvider;
    }

    /**
     * Evaluate if current page section is completed.
     * Uses AI + signals to make decision.
     */
    async evaluateCompletion(page: Page): Promise<CompletionEvaluation> {
        const startTime = Date.now();
        logger.info('[COMPLETION_EVALUATOR] Starting completion evaluation');

        try {
            // Step 1: Collect transparent signals (no AI)
            const signals = await collectCompletionSignals(page);
            logger.info(`[COMPLETION_EVALUATOR] Signals collected: ${JSON.stringify({
                hasCompletionText: signals.hasCompletionText,
                progressPercent: signals.progressPercent,
                quizSubmitted: signals.quizSubmitted,
                estimatedCompletion: signals.estimatedCompletion,
            })}`);

            // Step 2: If signals are very clear, return without AI
            if (signals.estimatedCompletion >= 0.8) {
                logger.info('[COMPLETION_EVALUATOR] High confidence from signals alone (>= 0.8), skipping AI');
                return {
                    isComplete: true,
                    confidence: Math.min(signals.estimatedCompletion, 1),
                    reason: `Confident completion detected: ${this.summarizeSignals(signals)}`,
                };
            }

            // Step 3: Extract DOM for AI analysis (if uncertainty)
            logger.info('[COMPLETION_EVALUATOR] Signals inconclusive, requesting AI analysis');
            const domResult = await browserTools.content.extractDOMForLLM(page, {
                maxTokens: 2000,
                strategy: 'llm-friendly',
                includeInteractive: true,
            });

            const domHtml = domResult.data?.html || '';
            const interactiveElements = domResult.data?.interactiveElements || [];

            // Step 4: Ask AI for interpretation
            const aiDecision = await this.askAIForCompletion(page, signals, domHtml, interactiveElements);
            logger.info(`[COMPLETION_EVALUATOR] AI decision: isComplete=${aiDecision.isComplete}, confidence=${aiDecision.confidence}, reason=${aiDecision.reason}`);

            return aiDecision;
        } catch (error) {
            logger.error({ error }, '[COMPLETION_EVALUATOR] Evaluation failed');
            return {
                isComplete: false,
                confidence: 0,
                reason: `Error during evaluation: ${error instanceof Error ? error.message : 'unknown'}`,
            };
        }
    }

    /**
     * Ask LLM to interpret signals + DOM and make completion decision
     */
    private async askAIForCompletion(
        page: Page,
        signals: CompletionSignals,
        domHtml: string,
        interactiveElements: any[]
    ): Promise<CompletionEvaluation> {
        const url = page.url();
        const title = await page.title();

        // Build structured context for AI
        const context = {
            url,
            title,
            signals: {
                hasCompletionText: signals.hasCompletionText,
                completionTextSnippet: signals.completionTextSnippet,
                progressPercent: signals.progressPercent,
                hasVideoElement: signals.hasVideoElement,
                hasQuizForm: signals.hasQuizForm,
                quizSubmitted: signals.quizSubmitted,
                hasMarkCompleteButton: signals.hasMarkCompleteButton,
                markCompleteButtonEnabled: signals.markCompleteButtonEnabled,
                hasNextButton: signals.hasNextButton,
                nextButtonEnabled: signals.nextButtonEnabled,
            },
            interactiveElementCount: interactiveElements.length,
        };

        const prompt = `You are analyzing a course section page to determine if it's been completed.

## Page Context
- URL: ${context.url}
- Title: ${context.title}

## Signals Detected (Transparent Facts)
${JSON.stringify(context.signals, null, 2)}

## Interactive Elements Found
${interactiveElements.slice(0, 10).map((el: any) => `- ${el.type}: "${el.text}" [selector: ${el.selector}]`).join('\n')}

## Simplified DOM (LLM-friendly)
\`\`\`
${domHtml.substring(0, 1500)}
\`\`\`

## Task
Based on the signals and DOM, determine:
1. **Is this section marked as complete?** (yes/no)
2. **Confidence level** (0.0-1.0) - how certain are you?
3. **Reason** - brief explanation in 1 sentence
4. **If not complete, list minimal actions** to mark it done (as JSON array, max 3 actions)

Respond ONLY as valid JSON:
\`\`\`json
{
  "isComplete": boolean,
  "confidence": number,
  "reason": "string",
  "requiredActions": [
    { "type": "click|scroll|play|wait", "selector": "string or null", "description": "string" }
  ]
}
\`\`\`

IMPORTANT:
- If "hasCompletionText" is true, isComplete is likely true.
- If "progressPercent" is 100, isComplete is likely true.
- If "quizSubmitted" is true, isComplete is likely true.
- If signals conflict, explain the conflict in "reason".
- If unsure, set lower confidence and suggest actions.
- Do NOT hallucinate selectors - only use ones from the interactive elements list.`;

        try {
            const response = await this.llmProvider.chat([
                {
                    role: 'user',
                    content: prompt,
                },
            ]);

            const responseText = response.content;
            logger.debug(`[COMPLETION_EVALUATOR] AI raw response: ${responseText}`);

            // Parse JSON from response
            const jsonMatch = responseText.match(/\{[\s\S]*\}/);
            if (!jsonMatch) {
                logger.warn('[COMPLETION_EVALUATOR] Could not extract JSON from AI response');
                return {
                    isComplete: false,
                    confidence: 0,
                    reason: 'AI response could not be parsed',
                };
            }

            const decision = JSON.parse(jsonMatch[0]) as CompletionEvaluation;
            return decision;
        } catch (error) {
            logger.error({ error }, '[COMPLETION_EVALUATOR] AI call failed');
            return {
                isComplete: false,
                confidence: 0,
                reason: `AI analysis failed: ${error instanceof Error ? error.message : 'unknown'}`,
            };
        }
    }

    /**
     * Summarize signals into human-readable string
     */
    private summarizeSignals(signals: CompletionSignals): string {
        const parts: string[] = [];
        if (signals.hasCompletionText) parts.push(`completion text "${signals.completionTextSnippet || ''}"`);
        if (signals.progressPercent === 100) parts.push('progress 100%');
        if (signals.quizSubmitted) parts.push('quiz submitted');
        if (!signals.markCompleteButtonEnabled && signals.hasMarkCompleteButton) parts.push('mark complete button disabled');
        return parts.join(' + ') || 'no clear signals';
    }
}
