import { BaseAgent } from './base-agent.js';
import { AgentTask, AgentResult } from './types.js';
import { CourseStructureAnalyzer } from './course-structure-analyzer.js';
import { SectionWorkflowExecutor } from './section-workflow-executor.js';
import { CourseProgressRepository } from '../db/repositories/course-progress.js';
import { CourseSectionRepository } from '../db/repositories/course-section.js';
import { getLogger } from '../utils/logger.js';
import * as readline from 'readline';

const logger = getLogger();

/**
 * Orchestrator Agent - Main boss that coordinates all sub-agents
 * Responsible for:
 * - Analyzing course structure
 * - Dispatching tasks to sub-agents
 * - Tracking progress
 * - Handling retries and failures
 */
export class OrchestratorAgent extends BaseAgent {
  getTaskType() {
    return 'orchestrator' as const;
  }

  getPromptFileName(): string {
    return 'orchestrator.md';
  }

  async execute(task: AgentTask): Promise<AgentResult> {
    const startTime = Date.now();
    const taskId = task.id;

    try {
      const courseName = task.context?.courseName;
      const courseUrl = task.context?.courseUrl;
      const llmProvider = task.context?.llmProvider; // LLM instance passed in

      logger.info(`Orchestrator starting: ${courseName} (${courseUrl})`);

      // ===== PHASE 1: Navigate & Auth Check =====
      const page = this.browser.getActivePage();
      logger.info('[ORCHESTRATOR] Phase 1/5: Navigating to course URL...');
      let navigatedUrl = '';
      try {
        navigatedUrl = await this.browser.navigateTo(courseUrl, 'networkidle');
      } catch (navError) {
        logger.warn('[ORCHESTRATOR] Navigation timeout, retrying with load strategy...');
        navigatedUrl = await this.browser.navigateTo(courseUrl, 'load');
      }

      let actualUrl = page.url();
      logger.info('[ORCHESTRATOR] Phase 1 complete. Checking authentication...');

      // Auth check
      const isAuth = await this.isAuthPage(actualUrl);
      if (isAuth) {
        logger.info(`Authentication required for ${courseUrl}`);
        while (true) {
          logger.info('Detected login page, waiting for manual sign-in...');
          const shouldContinue = await this.promptForRetry();
          if (!shouldContinue) {
            return {
              success: false,
              taskId,
              error: 'User aborted authentication',
              message: 'Authentication was cancelled by user.',
              durationMs: Date.now() - startTime,
            };
          }
          try {
            logger.info('Reloading page to check authentication status...');
            await page.reload({ waitUntil: 'load', timeout: 15000 });
            actualUrl = page.url();
            logger.info(`Page reloaded. Current URL: ${actualUrl}`);
          } catch (err) {
            logger.warn({ err }, 'Failed to reload page');
          }
          const stillAuth = await this.isAuthPage(actualUrl);
          if (!stillAuth) {
            logger.info('Authentication successful!');
            break;
          }
        }
      }

      // ===== PHASE 2: Analyze Course Structure (ONE AI CALL) =====
      logger.info('[ORCHESTRATOR] Phase 2/5: Analyzing course structure...');
      let coursePattern: any;
      if (llmProvider) {
        const analyzer = new CourseStructureAnalyzer(llmProvider);
        try {
          coursePattern = await analyzer.analyzeCoursePage(page, courseName);
          logger.info('[ORCHESTRATOR] Course pattern identified - will guide section workflows');
        } catch (err) {
          logger.warn({ err }, '[ORCHESTRATOR] Course analysis failed, will use defaults');
          coursePattern = null; // Fall back to simple workflow
        }
      }

      // ===== PHASE 3: Initialize Course Progress =====
      logger.info('[ORCHESTRATOR] Phase 3/5: Initializing course progress...');
      const progressRepo = new CourseProgressRepository();
      let courseProgress = progressRepo.findByUrl(courseUrl);

      if (!courseProgress) {
        logger.info('Creating new course progress entry...');
        // Extract sections from page (simple heuristic)
        const sections = await this.extractSectionNamesSimple(page);
        courseProgress = progressRepo.create(courseName, courseUrl, sections.length);

        // Create section entries
        const sectionRepo = new CourseSectionRepository();
        for (let i = 0; i < sections.length; i++) {
          sectionRepo.create(
            courseProgress.id,
            i + 1,
            sections[i],
            courseUrl, // Will navigate to section if needed
            'unknown'
          );
        }
        logger.info(`Created course progress: ${courseProgress.total_sections} sections`);
      } else {
        logger.info(`Resumed course: ${courseProgress.status} (${courseProgress.current_section}/${courseProgress.total_sections})`);
      }

      // ===== PHASE 4: Identify Next Section =====
      logger.info('[ORCHESTRATOR] Phase 4/5: Finding next pending section...');
      const sectionRepo = new CourseSectionRepository();
      const nextSection = sectionRepo.getNextPending(courseProgress.id);

      if (!nextSection) {
        logger.info('All sections completed!');
        progressRepo.markCompleted(courseProgress.id);
        return {
          success: true,
          taskId,
          action: 'course_completed',
          message: `Course completed! ${courseName}`,
          durationMs: Date.now() - startTime,
        };
      }

      // ===== PHASE 5: Generate & Execute Section Workflow =====
      logger.info(`[ORCHESTRATOR] Phase 5/5: Processing section ${nextSection.section_number}/${courseProgress.total_sections}: "${nextSection.section_name}"`);
      sectionRepo.startSection(nextSection.id);
      progressRepo.updateCurrentSection(courseProgress.id, nextSection.section_number);

      let workflowResult: any;
      if (coursePattern && llmProvider) {
        const executor = new SectionWorkflowExecutor(llmProvider);
        try {
          workflowResult = await executor.generateSectionWorkflow(
            page,
            nextSection.section_name,
            nextSection.section_number,
            coursePattern
          );

          logger.info(`[ORCHESTRATOR] Section workflow generated:`);
          logger.info(`  - Steps: ${workflowResult.workflowSteps.length}`);
          logger.info(`  - Completion: ${workflowResult.completionState}`);
          logger.info(`  - User message: ${workflowResult.userMessage}`);

          // Store workflow + state in section data
          const sectionData = {
            workflow: workflowResult,
            userMessage: workflowResult.userMessage,
            completionState: workflowResult.completionState,
            completionAttemptTime: Math.floor(Date.now() / 1000),
          };
          sectionRepo.findById(nextSection.id);
          // Would need method to update section data
          // sectionRepo.updateSectionData(nextSection.id, sectionData);
        } catch (err) {
          logger.error({ err }, '[ORCHESTRATOR] Workflow generation failed');
          sectionRepo.failSection(nextSection.id, `Workflow generation failed: ${err instanceof Error ? err.message : 'unknown'}`);
          throw err;
        }
      } else {
        logger.info('[ORCHESTRATOR] No AI pattern available, returning basic workflow');
        workflowResult = {
          sectionName: nextSection.section_name,
          completionState: 'needs_verification',
          userMessage: `Navigate to section: "${nextSection.section_name}" and complete it.`,
        };
      }

      return {
        success: true,
        taskId,
        action: 'section_workflow_generated',
        message: `Workflow ready for section: ${nextSection.section_name}`,
        data: {
          courseId: courseProgress.id,
          sectionId: nextSection.id,
          sectionName: nextSection.section_name,
          progress: `${nextSection.section_number}/${courseProgress.total_sections}`,
          workflow: workflowResult,
          userMessage: workflowResult.userMessage,
          completionState: workflowResult.completionState,
        },
        durationMs: Date.now() - startTime,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      const errorName = error instanceof Error ? error.name : 'Error';

      let context = '';
      if (errorMsg.includes('timeout') || errorMsg.includes('Timeout')) {
        context = ' (Timeout during navigation or AI analysis)';
      } else if (errorMsg.includes('navigation')) {
        context = ' (Failed to navigate to course)';
      } else if (errorMsg.includes('auth')) {
        context = ' (Authentication issue)';
      }

      logger.error({ error }, `Orchestrator error: ${errorName}${context}`);

      return {
        success: false,
        taskId,
        error: errorMsg,
        message: `Failed: ${errorMsg}${context}`,
        durationMs: Date.now() - startTime,
      };
    }
  }

  private async extractSectionNamesSimple(page: any): Promise<string[]> {
    try {
      return await page.evaluate(() => {
        const names: string[] = [];
        const headings = document.querySelectorAll('h2, h3, h4, .section-title, [class*="module"]');
        for (const h of Array.from(headings).slice(0, 20)) {
          const text = (h.textContent || '').trim();
          if (text.length > 3 && text.length < 200) {
            names.push(text);
          }
        }
        return names.length > 0 ? names : ['Section 1'];
      });
    } catch {
      return ['Section 1'];
    }
  }

  private async isAuthPage(url: string /* html param kept for signature compatibility */): Promise<boolean> {
    // Only use URL-based detection to avoid false positives from embedded/hidden forms
    const authPaths = ['/login', '/auth', '/signin', '/sign-in', '/log-in'];
    try {
      const urlObj = new URL(url);
      const path = (urlObj.pathname || '').toLowerCase();
      const hash = (urlObj.hash || '').toLowerCase();

      if (authPaths.some(p => path.includes(p))) {
        logger.info('[ORCHESTRATOR] Auth detection: URL path indicates login page');
        return true;
      }

      if (authPaths.some(p => hash.includes(p))) {
        logger.info('[ORCHESTRATOR] Auth detection: URL hash indicates login page');
        return true;
      }
    } catch (err) {
      logger.debug({ err }, '[ORCHESTRATOR] isAuthPage: URL parse failed');
    }

    logger.info('[ORCHESTRATOR] Auth detection: URL does not indicate login page');
    return false;
  }

  private async promptForRetry(): Promise<boolean> {
    console.log('Please sign in manually in the browser. Press Enter to retry or type "abort" to cancel.');
    const input = await this.getUserInput('');
    return input.toLowerCase() !== 'abort';
  }

  private getUserInput(question: string): Promise<string> {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    return new Promise((resolve) => {
      rl.question(question, (answer: string) => {
        rl.close();
        resolve(answer);
      });
    });
  }
}
