/**
 * Sanitize HTML for LLM consumption (server-side)
 * Goal: Remove noise, keep semantic meaning, fit within token limits
 */

const HIDDEN_TAGS = new Set([
  'script', 'style', 'meta', 'link', 'noscript', 'svg', 'path', 'g', 'defs', 'use', 'title', 'head',
]);

export interface SanitizeOptions {
  maxLength?: number;
  maxDepth?: number;
  preserveInteractive?: boolean;
  includeAttributes?: string[];
}

/**
 * Sanitize HTML content for LLM context (regex-based, no DOM parser)
 */
export function sanitizeHtmlForLLM(html: string, options?: SanitizeOptions): string {
  const { maxLength = 10000, maxDepth = 6, includeAttributes = [] } = options || {};

  let result = html;

  // Remove script and style tags with content
  result = result.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  result = result.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');
  result = result.replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi, '');

  // Remove meta, link, and other non-content tags
  result = result.replace(/<(?:meta|link|base|title)\b[^>]*>/gi, '');

  // Collapse excessive whitespace
  result = result.replace(/\s+/g, ' ');

  // Truncate if too long
  if (result.length > maxLength) {
    result = result.substring(0, maxLength) + '...<!-- TRUNCATED -->';
  }

  return result;
}

/**
 * Extract clean text content from HTML (regex-based)
 */
export function extractTextContent(html: string, maxLength: number = 5000): string {
  let result = html;

  // Remove all HTML tags
  result = result.replace(/<[^>]+>/g, '');

  // Decode HTML entities
  result = result.replace(/&quot;/g, '"');
  result = result.replace(/&apos;/g, "'");
  result = result.replace(/&amp;/g, '&');
  result = result.replace(/&lt;/g, '<');
  result = result.replace(/&gt;/g, '>');

  // Collapse whitespace
  result = result.replace(/\s+/g, ' ').trim();

  // Truncate if too long
  if (result.length > maxLength) {
    result = result.substring(0, maxLength) + '...';
  }

  return result;
}

/**
 * Extract interactive elements text from HTML
 */
export function extractInteractiveText(html: string): string {
  const interactive: string[] = [];

  // Extract button text
  const buttonMatches = html.matchAll(/<button[^>]*>([^<]+)<\/button>/gi);
  for (const match of buttonMatches) {
    if (match[1]) {
      interactive.push(`[Button: ${match[1].trim()}]`);
    }
  }

  // Extract link text
  const linkMatches = html.matchAll(/<a\s+(?:[^>])*href="([^"]*)"[^>]*>([^<]+)<\/a>/gi);
  for (const match of linkMatches) {
    if (match[2] && !match[1]?.includes('http')) {
      interactive.push(`[Link: ${match[2].trim()}]`);
    }
  }

  // Extract labels
  const labelMatches = html.matchAll(/<label[^>]*?(?:aria-label|title)="([^"]*)"[^>]*>/gi);
  for (const match of labelMatches) {
    if (match[1]) {
      interactive.push(`[Label: ${match[1].trim()}]`);
    }
  }

  return interactive.join('\n');
}
