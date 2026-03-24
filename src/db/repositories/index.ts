export { DOMCacheRepository } from './dom-cache.js';
export { CourseProgressRepository } from './course-progress.js';
export { CourseSectionRepository } from './course-section.js';

let domCacheRepo: DOMCacheRepository | null = null;
let courseProgressRepo: CourseProgressRepository | null = null;
let courseSectionRepo: CourseSectionRepository | null = null;

export function initializeRepositories() {
  domCacheRepo = new DOMCacheRepository();
  courseProgressRepo = new CourseProgressRepository();
  courseSectionRepo = new CourseSectionRepository();
}

export function getDOMCacheRepository(): DOMCacheRepository {
  if (!domCacheRepo) {
    throw new Error('Repositories not initialized. Call initializeRepositories first.');
  }
  return domCacheRepo;
}

export function getCourseProgressRepository(): CourseProgressRepository {
  if (!courseProgressRepo) {
    throw new Error('Repositories not initialized. Call initializeRepositories first.');
  }
  return courseProgressRepo;
}

export function getCourseSectionRepository(): CourseSectionRepository {
  if (!courseSectionRepo) {
    throw new Error('Repositories not initialized. Call initializeRepositories first.');
  }
  return courseSectionRepo;
}
