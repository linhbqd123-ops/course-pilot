import { randomUUID } from 'crypto';
import { getDatabase } from '../index.js';
import { CourseProgress } from '../types.js';

export class CourseProgressRepository {
  /**
   * Create new course progress entry
   */
  create(courseName: string, courseUrl: string, totalSections: number): CourseProgress {
    const db = getDatabase().getDatabase();
    const id = randomUUID();
    const now = Math.floor(Date.now() / 1000);

    const stmt = db.prepare(`
      INSERT INTO course_progress (
        id, course_url, course_name, started_at, current_section, 
        total_sections, status, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(id, courseUrl, courseName, now, 0, totalSections, 'in_progress', now);

    return {
      id,
      course_url: courseUrl,
      course_name: courseName,
      started_at: now,
      completed_at: undefined,
      current_section: 0,
      total_sections: totalSections,
      status: 'in_progress',
      metadata: '{}', // JSON
      updated_at: now,
    };
  }

  /**
   * Find by course URL
   */
  findByUrl(courseUrl: string): CourseProgress | null {
    const db = getDatabase().getDatabase();
    const stmt = db.prepare('SELECT * FROM course_progress WHERE course_url = ?');
    const row = stmt.get(courseUrl) as any;
    return row ? this.mapRow(row) : null;
  }

  /**
   * Find by ID
   */
  findById(id: string): CourseProgress | null {
    const db = getDatabase().getDatabase();
    const stmt = db.prepare('SELECT * FROM course_progress WHERE id = ?');
    const row = stmt.get(id) as any;
    return row ? this.mapRow(row) : null;
  }

  /**
   * Get all in-progress courses
   */
  getInProgress(): CourseProgress[] {
    const db = getDatabase().getDatabase();
    const stmt = db.prepare('SELECT * FROM course_progress WHERE status = ? ORDER BY updated_at DESC');
    const rows = stmt.all('in_progress') as any[];
    return rows.map((r) => this.mapRow(r));
  }

  /**
   * Update current section
   */
  updateCurrentSection(id: string, section: number): void {
    const db = getDatabase().getDatabase();
    const now = Math.floor(Date.now() / 1000);

    const stmt = db.prepare(`
      UPDATE course_progress 
      SET current_section = ?, updated_at = ?
      WHERE id = ?
    `);

    stmt.run(section, now, id);
  }

  /**
   * Mark course as completed
   */
  markCompleted(id: string): void {
    const db = getDatabase().getDatabase();
    const now = Math.floor(Date.now() / 1000);

    const stmt = db.prepare(`
      UPDATE course_progress 
      SET status = ?, completed_at = ?, updated_at = ?
      WHERE id = ?
    `);

    stmt.run('completed', now, now, id);
  }

  /**
   * Pause course
   */
  pause(id: string): void {
    const db = getDatabase().getDatabase();
    const now = Math.floor(Date.now() / 1000);

    const stmt = db.prepare(`
      UPDATE course_progress 
      SET status = ?, updated_at = ?
      WHERE id = ?
    `);

    stmt.run('paused', now, id);
  }

  /**
   * Resume course
   */
  resume(id: string): void {
    const db = getDatabase().getDatabase();
    const now = Math.floor(Date.now() / 1000);

    const stmt = db.prepare(`
      UPDATE course_progress 
      SET status = ?, updated_at = ?
      WHERE id = ?
    `);

    stmt.run('in_progress', now, id);
  }

  /**
   * Mark course as failed
   */
  markFailed(id: string, reason?: string): void {
    const db = getDatabase().getDatabase();
    const now = Math.floor(Date.now() / 1000);

    let metadata = {};
    try {
      const current = this.findById(id);
      if (current?.metadata) {
        metadata = JSON.parse(current.metadata);
      }
    } catch { }

    metadata = { ...metadata, failureReason: reason };

    const stmt = db.prepare(`
      UPDATE course_progress 
      SET status = ?, updated_at = ?, metadata = ?
      WHERE id = ?
    `);

    stmt.run('failed', now, JSON.stringify(metadata), id);
  }

  /**
   * Get progress percentage
   */
  getProgress(id: string): number {
    const progress = this.findById(id);
    if (!progress || progress.total_sections === 0) {
      return 0;
    }
    return Math.round((progress.current_section / progress.total_sections) * 100);
  }

  private mapRow(row: any): CourseProgress {
    return {
      ...row,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
    };
  }
}
