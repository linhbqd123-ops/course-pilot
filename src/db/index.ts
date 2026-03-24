import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';
import { getLogger } from '../utils/logger.js';
import { DatabaseConfig } from '../config/schema.js';

const logger = getLogger();

export class AgentDatabase {
  private db: Database.Database;

  constructor(config: DatabaseConfig) {
    // Ensure directory exists
    const dbDir = path.dirname(config.path);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    this.db = new Database(config.path);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');

    this.initializeSchema();
  }

  private initializeSchema(): void {
    // Create tables if they don't exist
    this.db.exec(`
      -- DOM Cache Table
      CREATE TABLE IF NOT EXISTS dom_cache (
        id TEXT PRIMARY KEY,
        url_pattern TEXT NOT NULL,
        selectors TEXT NOT NULL, -- JSON
        hit_count INTEGER DEFAULT 0,
        version INTEGER DEFAULT 1,
        stale BOOLEAN DEFAULT 0,
        last_validated_at INTEGER,
        failure_count INTEGER DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        UNIQUE(url_pattern)
      );

      CREATE INDEX IF NOT EXISTS idx_dom_cache_url_pattern ON dom_cache(url_pattern);
      CREATE INDEX IF NOT EXISTS idx_dom_cache_hit_count ON dom_cache(hit_count);

      -- Course Progress Table
      CREATE TABLE IF NOT EXISTS course_progress (
        id TEXT PRIMARY KEY,
        course_url TEXT NOT NULL UNIQUE,
        course_name TEXT NOT NULL,
        started_at INTEGER NOT NULL,
        completed_at INTEGER,
        current_section INTEGER DEFAULT 0,
        total_sections INTEGER DEFAULT 0,
        status TEXT DEFAULT 'in_progress', -- in_progress, completed, paused, failed
        metadata TEXT, -- JSON
        updated_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_course_progress_status ON course_progress(status);

      -- Course Sections Table
      CREATE TABLE IF NOT EXISTS course_sections (
        id TEXT PRIMARY KEY,
        course_id TEXT NOT NULL,
        section_number INTEGER NOT NULL,
        section_name TEXT NOT NULL,
        page_type TEXT DEFAULT 'unknown', -- video, quiz, reading, navigation, unknown
        page_url TEXT NOT NULL,
        status TEXT DEFAULT 'pending', -- pending, in_progress, completed, failed, skipped
        attempts INTEGER DEFAULT 0,
        last_error TEXT,
        error_log TEXT, -- JSON array
        started_at INTEGER,
        completed_at INTEGER,
        data TEXT, -- JSON with page-specific data
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY (course_id) REFERENCES course_progress(id),
        UNIQUE(course_id, section_number)
      );

      CREATE INDEX IF NOT EXISTS idx_course_sections_course_id ON course_sections(course_id);
      CREATE INDEX IF NOT EXISTS idx_course_sections_status ON course_sections(status);

      -- Page Snapshots Table
      CREATE TABLE IF NOT EXISTS page_snapshots (
        id TEXT PRIMARY KEY,
        url TEXT NOT NULL,
        url_hash TEXT NOT NULL,
        dom_html TEXT,
        simplified_dom TEXT,
        text_content TEXT,
        page_type TEXT,
        screenshot BLOB,
        created_at INTEGER NOT NULL,
        ttl INTEGER DEFAULT 3600, -- 1 hour default
        UNIQUE(url_hash)
      );

      CREATE INDEX IF NOT EXISTS idx_page_snapshots_url_hash ON page_snapshots(url_hash);
      CREATE INDEX IF NOT EXISTS idx_page_snapshots_created_at ON page_snapshots(created_at);

      -- Quiz History Table
      CREATE TABLE IF NOT EXISTS quiz_history (
        id TEXT PRIMARY KEY,
        section_id TEXT NOT NULL,
        question_number INTEGER NOT NULL,
        question_text TEXT NOT NULL,
        question_hash TEXT NOT NULL,
        options TEXT NOT NULL, -- JSON array
        selected_answer TEXT,
        correct_answer TEXT,
        is_correct BOOLEAN DEFAULT 0,
        confidence REAL DEFAULT 0.5,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (section_id) REFERENCES course_sections(id),
        UNIQUE(section_id, question_hash)
      );

      CREATE INDEX IF NOT EXISTS idx_quiz_history_section_id ON quiz_history(section_id);
      CREATE INDEX IF NOT EXISTS idx_quiz_history_is_correct ON quiz_history(is_correct);

      -- Progress Indicators Table
      CREATE TABLE IF NOT EXISTS progress_indicators (
        id TEXT PRIMARY KEY,
        course_id TEXT NOT NULL,
        current_progress REAL DEFAULT 0,
        steps_completed INTEGER DEFAULT 0,
        total_steps INTEGER DEFAULT 0,
        timestamp INTEGER NOT NULL,
        FOREIGN KEY (course_id) REFERENCES course_progress(id)
      );

      CREATE INDEX IF NOT EXISTS idx_progress_indicators_course_id ON progress_indicators(course_id);
    `);

    logger.info('Database schema initialized');
  }

  getDatabase(): Database.Database {
    return this.db;
  }

  close(): void {
    this.db.close();
  }

  cleanup(): void {
    // Remove old page snapshots
    const ttlThreshold = Math.floor(Date.now() / 1000) - 3600; // 1 hour old
    const stmt = this.db.prepare('DELETE FROM page_snapshots WHERE created_at < ?');
    const result = stmt.run(ttlThreshold);
    if ((result.changes as number) > 0) {
      logger.debug(`Cleaned up ${result.changes} old page snapshots`);
    }
  }
}

// Global database instance
let globalDb: AgentDatabase | null = null;

export function initializeDatabase(config: DatabaseConfig): AgentDatabase {
  globalDb = new AgentDatabase(config);
  return globalDb;
}

export function getDatabase(): AgentDatabase {
  if (!globalDb) {
    throw new Error('Database not initialized. Call initializeDatabase first.');
  }
  return globalDb;
}
