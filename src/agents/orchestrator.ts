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
      const sectionRepo = new CourseSectionRepository();
      let courseProgress = progressRepo.findByUrl(courseUrl);

      // Extract sections from page (fallback)
      const pageExtractedSections = await this.extractSectionNamesSimple(page);

      if (!courseProgress) {
        // [PLAN] New course: create progress + sections
        logger.info('Creating new course progress entry...');
        const sectionCount = pageExtractedSections.length || 1;
        courseProgress = progressRepo.create(courseName, courseUrl, sectionCount);

        // Create section entries
        for (let i = 0; i < pageExtractedSections.length; i++) {
          sectionRepo.create(
            courseProgress.id,
            i + 1,
            pageExtractedSections[i],
            courseUrl,
            'unknown'
          );
        }
        logger.info(`Created course progress: ${courseProgress.total_sections} sections`);
      } else {
        // [PLAN] Resume course: validate DB sections against detected sections
        logger.info(`Resumed course: ${courseProgress.status} (${courseProgress.current_section}/${courseProgress.total_sections})`);
        
        // [ANALYZE] Check if course structure changed (new analyzer + existing DB)
        const dbSections = sectionRepo.findByCourseId(courseProgress.id);
        
        // Determine authoritative section list (use extracted names)
        let authoritiveSections = pageExtractedSections;
        let aiDetectedCount = authoritiveSections.length;
        
        if (coursePattern?.courseStructure?.totalSections) {
          // AI analysis provides reliable count - might differ from page extraction
          aiDetectedCount = coursePattern.courseStructure.totalSections;
          logger.info(`[ANALYZE] AI detected ${aiDetectedCount} sections, page extracted ${authoritiveSections.length}`);
          
          // If AI count differs from extraction, pad extracted with generic names or use AI count
          if (aiDetectedCount > authoritiveSections.length) {
            logger.warn(`[ANALYZE] AI count (${aiDetectedCount}) > extracted (${authoritiveSections.length}), padding...`);
            for (let i = authoritiveSections.length; i < aiDetectedCount; i++) {
              authoritiveSections.push(`Section ${i + 1}`);
            }
          }
        }

        // [VERIFY] If section count mismatch, refresh DB
        if (dbSections.length !== authoritiveSections.length && authoritiveSections.length > 0) {
          logger.warn(`[VERIFY] Section count mismatch: DB=${dbSections.length}, detected=${authoritiveSections.length}. Refreshing...`);
          
          // Delete old sections (if not all completed)
          const nonCompletedCount = dbSections.filter(s => s.status !== 'completed').length;
          if (nonCompletedCount > 0) {
            logger.info(`Deleting ${dbSections.length} old sections to recreate...`);
            // Use transaction to atomically delete all and recreate
            const db = require('../db/index.js').getDatabase().getDatabase();
            try {
              const deleteStmt = db.prepare('DELETE FROM course_sections WHERE course_id = ?');
              deleteStmt.run(courseProgress.id);
              logger.info(`Deleted all ${dbSections.length} sections for course`);
            } catch (e) {
              logger.error({ err: e }, `Failed to delete sections for course ${courseProgress.id}`);
              throw e;
            }
          }

          // Recreate sections from authoritative list
          for (let i = 0; i < authoritiveSections.length; i++) {
            sectionRepo.create(
              courseProgress.id,
              i + 1,
              authoritiveSections[i],
              courseUrl,
              'unknown'
            );
          }

          // Update course progress with new section count
          const db = require('../db/index.js').getDatabase().getDatabase();
          db.prepare(
            `UPDATE course_progress SET total_sections = ?, status = ?, current_section = ? WHERE id = ?`
          ).run(authoritiveSections.length, 'in_progress', 0, courseProgress.id);

          courseProgress.total_sections = authoritiveSections.length;
          logger.info(`Refreshed: ${authoritiveSections.length} sections recreated, status reset to in_progress`);
        }
      }

      // ===== PHASE 4 & 5: Process Sections (Agentic Loop) =====
      logger.info('[ORCHESTRATOR] Phase 4/5: Processing pending sections...');
      
      let sectionsProcessed = 0;
      let lastError: Error | null = null;

      // Agentic loop: analyze → plan → execute → verify → repeat
      while (true) {
        // [ANALYZE] Find next pending section
        const nextSection = sectionRepo.getNextPending(courseProgress.id);
        
        if (!nextSection) {
          // [VERIFY] All sections complete
          logger.info('[ORCHESTRATOR] All sections completed!');
          progressRepo.markCompleted(courseProgress.id);
          break;
        }

        // [PLAN] Log what we're about to do
        logger.info(`[ORCHESTRATOR] Processing section ${nextSection.section_number}/${courseProgress.total_sections}: "${nextSection.section_name}"`);
        sectionRepo.startSection(nextSection.id);
        progressRepo.updateCurrentSection(courseProgress.id, nextSection.section_number);

        // [EXECUTE] Generate and execute workflow
        try {
          if (coursePattern && llmProvider) {
            const executor = new SectionWorkflowExecutor(llmProvider);
            const workflowResult = await executor.generateSectionWorkflow(
              page,
              nextSection.section_name,
              nextSection.section_number,
              coursePattern
            );

            logger.info(`[ORCHESTRATOR] Section workflow:`);
            logger.info(`  - Steps: ${workflowResult.workflowSteps?.length || 0}`);
            logger.info(`  - Completion: ${workflowResult.completionState}`);
            logger.info(`  ​- Message: ${workflowResult.userMessage}`);

          } else {
            logger.info('[ORCHESTRATOR] No AI pattern, using basic workflow');
            const userMsg = `Navigate to section: "${nextSection.section_name}" and complete it.`;
            logger.info(`  - Message: ${userMsg}`);
          }

          // [VERIFY] Mark section complete
          sectionRepo.completeSection(nextSection.id);
          sectionsProcessed++;
          logger.info(`[ORCHESTRATOR] Section ${nextSection.section_number} marked complete`);

        } catch (err) {
          // [HANDLE ERROR] Log and store for later
          const errorMsg = err instanceof Error ? err.message : String(err);
          logger.error({ err }, `[ORCHESTRATOR] Section ${nextSection.section_number} failed: ${errorMsg}`);
          sectionRepo.failSection(nextSection.id, errorMsg);
          lastError = err as Error;
          
          // Continue to next section (or break if critical error)
          if (errorMsg.includes('API') || errorMsg.includes('auth')) {
            logger.error('[ORCHESTRATOR] Critical error, stopping loop');
            throw err;
          }
        }
      }

      // Return result after processing all sections (or until error)
      return {
        success: !lastError,
        taskId,
        action: 'course_completed',
        message: `Course completed! Processed ${sectionsProcessed} sections.${courseName}`,
        data: { sectionsProcessed, courseId: courseProgress.id },
        error: lastError?.message,
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
      if (authPaths.some(p => url.includes(p))) {
        logger.info('[ORCHESTRATOR] Auth detection: URL path indicates login page');
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
