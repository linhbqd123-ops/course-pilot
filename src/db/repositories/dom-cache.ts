import { randomUUID } from 'crypto';
import { getDatabase } from '../index.js';
import { DOMCacheEntry } from '../types.js';

export class DOMCacheRepository {
  /**
   * Find cached DOM selectors by URL pattern
   */
  findByUrl(url: string): DOMCacheEntry | null {
    const db = getDatabase().getDatabase();

    // Extract domain from URL
    const domain = new URL(url).hostname;

    // Try exact match first
    let stmt = db.prepare(`
      SELECT * FROM dom_cache 
      WHERE url_pattern = ? AND NOT stale
      ORDER BY hit_count DESC
      LIMIT 1
    `);

    let result = stmt.get(url) as any;
    if (result) {
      return this.mapRow(result);
    }

    // Try pattern match
    stmt = db.prepare(`
      SELECT * FROM dom_cache 
      WHERE url_pattern LIKE ? AND NOT stale
      ORDER BY hit_count DESC
      LIMIT 1
    `);

    result = stmt.get(`%${domain}%`) as any;
    if (result) {
      return this.mapRow(result);
    }

    return null;
  }

  /**
   * Find all cached entries for a URL pattern
   */
  findAll(urlPattern: string): DOMCacheEntry[] {
    const db = getDatabase().getDatabase();
    const stmt = db.prepare(`
      SELECT * FROM dom_cache 
      WHERE url_pattern LIKE ?
      ORDER BY hit_count DESC
    `);

    const results = stmt.all(`%${urlPattern}%`) as any[];
    return results.map((r) => this.mapRow(r));
  }

  /**
   * Create or update DOM cache entry
   */
  upsert(entry: Partial<DOMCacheEntry> & { url_pattern: string; selectors: Record<string, string> }): DOMCacheEntry {
    const db = getDatabase().getDatabase();
    const now = Math.floor(Date.now() / 1000);

    // Check if exists
    const existing = db
      .prepare('SELECT id FROM dom_cache WHERE url_pattern = ?')
      .get(entry.url_pattern) as any;

    if (existing) {
      const stmt = db.prepare(`
        UPDATE dom_cache 
        SET selectors = ?, version = version + 1, updated_at = ?, stale = 0
        WHERE url_pattern = ?
      `);
      stmt.run(JSON.stringify(entry.selectors), now, entry.url_pattern);

      return this.findAll(entry.url_pattern)[0]!;
    } else {
      const id = randomUUID();
      const stmt = db.prepare(`
        INSERT INTO dom_cache (id, url_pattern, selectors, hit_count, created_at, updated_at)
        VALUES (?, ?, ?, 0, ?, ?)
      `);
      stmt.run(id, entry.url_pattern, JSON.stringify(entry.selectors), now, now);

      return {
        id,
        url_pattern: entry.url_pattern,
        selectors: entry.selectors,
        hit_count: 0,
        version: 1,
        stale: false,
        last_validated_at: now,
        failure_count: 0,
        created_at: now,
        updated_at: now,
      };
    }
  }

  /**
   * Increment hit count for successful usage
   */
  incrementHitCount(id: string): void {
    const db = getDatabase().getDatabase();
    const now = Math.floor(Date.now() / 1000);

    const stmt = db.prepare(`
      UPDATE dom_cache 
      SET hit_count = hit_count + 1, last_validated_at = ?
      WHERE id = ?
    `);
    stmt.run(now, id);
  }

  /**
   * Mark entry as stale (unreliable selectors)
   */
  markStale(id: string): void {
    const db = getDatabase().getDatabase();
    const stmt = db.prepare('UPDATE dom_cache SET stale = 1 WHERE id = ?');
    stmt.run(id);
  }

  /**
   * Increment failure count
   */
  incrementFailureCount(id: string): number {
    const db = getDatabase().getDatabase();
    const stmt = db.prepare(`
      UPDATE dom_cache 
      SET failure_count = failure_count + 1
      WHERE id = ?
    `);
    stmt.run(id);

    const result = db.prepare('SELECT failure_count FROM dom_cache WHERE id = ?').get(id) as any;
    return result?.failure_count || 0;
  }

  /**
   * Delete old/unused cache entries
   */
  deleteStale(daysOld: number = 30): number {
    const db = getDatabase().getDatabase();
    const threshold = Math.floor(Date.now() / 1000) - daysOld * 24 * 60 * 60;

    const stmt = db.prepare(`
      DELETE FROM dom_cache 
      WHERE stale = 1 OR (updated_at < ? AND hit_count = 0)
    `);

    const result = stmt.run(threshold);
    return result.changes as number;
  }

  private mapRow(row: any): DOMCacheEntry {
    return {
      ...row,
      selectors: JSON.parse(row.selectors || '{}'),
    };
  }
}
