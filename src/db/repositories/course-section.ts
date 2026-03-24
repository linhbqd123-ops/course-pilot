import { randomUUID } from 'crypto';
import { getDatabase } from '../index.js';
import { CourseSection } from '../types.js';

export class CourseSectionRepository {
  /**
   * Create new section
   */
  create(
    courseId: string,
    sectionNumber: number,
    name: string,
    pageUrl: string,
    pageType: string
  ): CourseSection {
    const db = getDatabase().getDatabase();
    const id = randomUUID();
    const now = Math.floor(Date.now() / 1000);

    const stmt = db.prepare(`
      INSERT INTO course_sections (
        id, course_id, section_number, section_name, page_url, page_type, status, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(id, courseId, sectionNumber, name, pageUrl, pageType, 'pending', now, now);

    return {
      id,
      course_id: courseId,
      section_number: sectionNumber,
      section_name: name,
      page_type: pageType as any,
      page_url: pageUrl,
      status: 'pending',
      attempts: 0,
      error_log: '[]',
      data: '{}',
      created_at: now,
      updated_at: now,
    };
  }

  /**
   * Get all sections for a course
   */
  findByCourseId(courseId: string, status?: string): CourseSection[] {
    const db = getDatabase().getDatabase();
    
    let query = 'SELECT * FROM course_sections WHERE course_id = ?';
    const params: any[] = [courseId];

    if (status) {
      query += ' AND status = ?';
      params.push(status);
    }

    query += ' ORDER BY section_number ASC';

    const stmt = db.prepare(query);
    const rows = stmt.all(...params) as any[];
    return rows.map((r) => this.mapRow(r));
  }

  /**
   * Find section by ID
   */
  findById(id: string): CourseSection | null {
    const db = getDatabase().getDatabase();
    const stmt = db.prepare('SELECT * FROM course_sections WHERE id = ?');
    const row = stmt.get(id) as any;
    return row ? this.mapRow(row) : null;
  }

  /**
   * Get next pending section in a course
   */
  getNextPending(courseId: string): CourseSection | null {
    const db = getDatabase().getDatabase();
    const stmt = db.prepare(`
      SELECT * FROM course_sections 
      WHERE course_id = ? AND status IN ('pending', 'failed')
      ORDER BY section_number ASC
      LIMIT 1
    `);

    const row = stmt.get(courseId) as any;
    return row ? this.mapRow(row) : null;
  }

  /**
   * Mark section as started
   */
  startSection(id: string): void {
    const db = getDatabase().getDatabase();
    const now = Math.floor(Date.now() / 1000);

    const stmt = db.prepare(`
      UPDATE course_sections 
      SET status = ?, started_at = ?, updated_at = ?
      WHERE id = ?
    `);

    stmt.run('in_progress', now, now, id);
  }

  /**
   * Mark section as completed
   */
  completeSection(id: string, data?: Record<string, any>): void {
    const db = getDatabase().getDatabase();
    const now = Math.floor(Date.now() / 1000);

    const section = this.findById(id);
    if (!section) return;

    const sectionData = data || (section.data ? JSON.parse(section.data) : {});

    const stmt = db.prepare(`
      UPDATE course_sections 
      SET status = ?, completed_at = ?, updated_at = ?, data = ?
      WHERE id = ?
    `);

    stmt.run('completed', now, now, JSON.stringify(sectionData), id);
  }

  /**
   * Mark section as failed with error
   */
  failSection(id: string, error: string): void {
    const db = getDatabase().getDatabase();
    const now = Math.floor(Date.now() / 1000);

    const section = this.findById(id);
    if (!section) return;

    const attempts = (section.attempts || 0) + 1;
    const errorLog = section.error_log ? JSON.parse(section.error_log) : [];
    errorLog.push({ timestamp: now, error, attempt: attempts });

    const stmt = db.prepare(`
      UPDATE course_sections 
      SET status = ?, attempts = ?, last_error = ?, error_log = ?, updated_at = ?
      WHERE id = ?
    `);

    stmt.run('failed', attempts, error, JSON.stringify(errorLog), now, id);
  }

  /**
   * Skip section
   */
  skipSection(id: string, reason?: string): void {
    const db = getDatabase().getDatabase();
    const now = Math.floor(Date.now() / 1000);

    const section = this.findById(id);
    if (!section) return;

    const sectionData = section.data ? JSON.parse(section.data) : {};
    sectionData.skippedReason = reason || 'Skipped by agent';

    const stmt = db.prepare(`
      UPDATE course_sections 
      SET status = ?, data = ?, updated_at = ?
      WHERE id = ?
    `);

    stmt.run('skipped', JSON.stringify(sectionData), now, id);
  }

  /**
   * Get statistics for a course
   */
  getStats(courseId: string): {
    total: number;
    completed: number;
    inProgress: number;
    failed: number;
    skipped: number;
    pending: number;
  } {
    const db = getDatabase().getDatabase();
    const stmt = db.prepare(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) as inProgress,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
        SUM(CASE WHEN status = 'skipped' THEN 1 ELSE 0 END) as skipped,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending
      FROM course_sections
      WHERE course_id = ?
    `);

    const result = stmt.get(courseId) as any;
    return {
      total: result?.total || 0,
      completed: result?.completed || 0,
      inProgress: result?.inProgress || 0,
      failed: result?.failed || 0,
      skipped: result?.skipped || 0,
      pending: result?.pending || 0,
    };
  }

  private mapRow(row: any): CourseSection {
    return {
      ...row,
      page_type: row.page_type as any,
      error_log: row.error_log || '[]',
      data: row.data || '{}',
    };
  }
}
