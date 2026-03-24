import { BaseAgent } from './base-agent.js';
import { AgentTask, AgentResult } from './types.js';
import { classifyPage, extractCourseStructure } from '../analyzers/page-classifier.js';
import { CourseProgressRepository } from '../db/repositories/course-progress.js';
import { CourseSectionRepository } from '../db/repositories/course-section.js';
import { getLogger } from '../utils/logger.js';

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

      logger.info(`Orchestrator starting: ${courseName} (${courseUrl})`);

      // Navigate to course URL
      const page = this.browser.getActivePage();
      await this.browser.navigateTo(courseUrl, 'networkidle');

      // Get or create course progress entry
      const progressRepo = new CourseProgressRepository();
      let courseProgress = progressRepo.findByUrl(courseUrl);

      if (!courseProgress) {
        // Extract course structure
        logger.info('Extracting course structure...');
        const structure = await extractCourseStructure(page);
        logger.info(`Found ${structure.totalSections} sections`);

        // Create course progress entry
        courseProgress = progressRepo.create(courseName, courseUrl, structure.totalSections);

        // Create section entries
        const sectionRepo = new CourseSectionRepository();
        for (let i = 0; i < structure.sections.length; i++) {
          const section = structure.sections[i];
          sectionRepo.create(
            courseProgress.id,
            i + 1,
            section.name,
            section.url || courseUrl,
            'unknown'
          );
        }

        logger.info(`Created course progress entry: ${courseProgress.id}`);
      } else {
        logger.info(`Resumed course progress: ${courseProgress.id}`);
      }

      // Process sections
      const sectionRepo = new CourseSectionRepository();
      const nextSection = sectionRepo.getNextPending(courseProgress.id);

      if (!nextSection) {
        logger.info('All sections completed!');
        progressRepo.markCompleted(courseProgress.id);

        return {
          success: true,
          taskId,
          action: 'course_completed',
          message: `Course ${courseName} completed!`,
          durationMs: Date.now() - startTime,
        };
      }

      // Update progress
      progressRepo.updateCurrentSection(courseProgress.id, nextSection.section_number);
      logger.info(`Processing section ${nextSection.section_number}/${courseProgress.total_sections}: ${nextSection.section_name}`);

      // Classify current page
      const classification = await classifyPage(page);
      logger.info(`Page classified as: ${classification.type} (confidence: ${(classification.confidence * 100).toFixed(0)}%)`);

      // Update section page type
      if (classification.type !== 'unknown') {
        sectionRepo.findByCourseId(courseProgress.id).forEach((s) => {
          if (s.id === nextSection.id) {
            // Would need to update method in repo
          }
        });
      }

      return {
        success: true,
        taskId,
        action: 'section_processed',
        message: `Processing section: ${nextSection.section_name}`,
        data: {
          courseId: courseProgress.id,
          sectionId: nextSection.id,
          sectionType: classification.type,
          progress: `${nextSection.section_number}/${courseProgress.total_sections}`,
        },
        durationMs: Date.now() - startTime,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      logger.error({ error }, 'Orchestrator error');

      return {
        success: false,
        taskId,
        error: errorMsg,
        message: `Failed to process course: ${errorMsg}`,
        durationMs: Date.now() - startTime,
      };
    }
  }
}
