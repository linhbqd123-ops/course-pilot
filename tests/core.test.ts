import { describe, it, expect } from 'vitest';
import { sanitizeHtmlForLLM, extractTextContent } from '../src/utils/html-sanitizer';

describe('HTML Sanitizer', () => {
  it('should remove script tags', () => {
    const html = '<div>Content</div><script>alert("xss")</script>';
    const result = sanitizeHtmlForLLM(html);
    expect(result).not.toContain('alert');
  });

  it('should extract text content', () => {
    const html = '<div>Hello <strong>World</strong></div>';
    const result = extractTextContent(html);
    expect(result).toContain('Hello');
    expect(result).toContain('World');
  });

  it('should truncate long content', () => {
    const longHtml = '<p>' + 'x'.repeat(10000) + '</p>';
    const result = sanitizeHtmlForLLM(longHtml, { maxLength: 1000 });
    expect(result.length).toBeLessThanOrEqual(1100); // 1000 + some buffer
  });
});

describe('Config', () => {
  it('should load default config', async () => {
    const { ConfigSchema } = await import('../src/config/schema');
    const testConfig = {
      browser: { headless: false },
      logging: { level: 'info' },
    };
    const result = ConfigSchema.parse(testConfig);
    expect(result).toBeDefined();
    expect(result.browser.headless).toBe(false);
  });
});
