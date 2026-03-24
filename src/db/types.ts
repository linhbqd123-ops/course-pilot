// Database type definitions

export interface DOMCacheEntry {
  id: string;
  url_pattern: string;
  selectors: Record<string, string>; // JSON serialized
  hit_count: number;
  version: number;
  stale: boolean;
  last_validated_at: number; // timestamp
  failure_count: number;
  created_at: number;
  updated_at: number;
}

export interface CourseProgress {
  id: string;
  course_url: string;
  course_name: string;
  started_at: number;
  completed_at?: number;
  current_section: number;
  total_sections: number;
  status: 'in_progress' | 'completed' | 'paused' | 'failed';
  metadata: string; // JSON
  updated_at: number;
}

export interface CourseSection {
  id: string;
  course_id: string;
  section_number: number;
  section_name: string;
  page_type: 'video' | 'quiz' | 'reading' | 'navigation' | 'unknown';
  page_url: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'skipped';
  attempts: number;
  last_error?: string;
  error_log: string; // JSON array  
  started_at?: number;
  completed_at?: number;
  data: string; // JSON with page-specific data
  created_at: number;
  updated_at: number;
}

export interface PageSnapshot {
  id: string;
  url: string;
  url_hash: string;
  dom_html: string;
  simplified_dom: string;
  text_content: string;
  page_type: string;
  screenshot?: Buffer;
  created_at: number;
  ttl: number; // Time to live in seconds
}

export interface QuizEntry {
  id: string;
  section_id: string;
  question_number: number;
  question_text: string;
  question_hash: string;
  options: string[]; // JSON
  selected_answer?: string;
  correct_answer?: string;
  is_correct: boolean;
  confidence: number; // 0-1
  created_at: number;
}

export interface ProgressIndicator {
  id: string;
  course_id: string;
  current_progress: number; // 0-100
  steps_completed: number;
  total_steps: number;
  timestamp: number;
}
