import { Page } from 'playwright';
import { ExtractDOMToolInput, ExtractDOMToolOutput, InteractiveElement, ToolOutput } from './types.js';

const INTERACTIVE_TAGS = [
  'BUTTON',
  'A',
  'INPUT',
  'SELECT',
  'TEXTAREA',
  'FORM',
  '[role="button"]',
  '[role="link"]',
  '[onclick]',
];

export async function extractDOMForLLM(
  page: Page,
  input: ExtractDOMToolInput
): Promise<ToolOutput<ExtractDOMToolOutput>> {
  const startTime = Date.now();

  try {
    const {
      maxTokens = 3000,
      strategy = 'llm-friendly',
      includeInteractive = true,
      includeAttributes = ['id', 'class', 'placeholder', 'type', 'value', 'aria-label', 'role'],
    } = input;

    let html = '';

    if (strategy === 'llm-friendly') {
      html = await page.evaluate(
        (includeAttrs) => {
          const sanitizeElement = (el: Element, depth = 0): string => {
            const maxDepth = 5;
            if (depth > maxDepth) return '';

            // Get element tag
            const tag = el.tagName.toLowerCase();

            // Skip noisy elements
            if (
              ['script', 'style', 'meta', 'link', 'noscript', 'svg', 'iframe'].includes(tag)
            ) {
              return '';
            }

            // Get attributes
            const attrs: Record<string, string> = {};
            for (const attr of Array.from(el.attributes)) {
              if (includeAttrs.includes(attr.name)) {
                attrs[attr.name] = attr.value;
              }
            }

            const attrStr = Object.entries(attrs)
              .map(([k, v]) => `${k}="${v}"`)
              .join(' ');

            // Get text content (truncate long text)
            let textContent = (el.textContent || '').trim();
            // Remove excessive whitespace
            textContent = textContent.replace(/\s+/g, ' ').substring(0, 200);

            // Recursively process children
            let childHtml = '';
            for (const child of Array.from(el.children)) {
              if (child instanceof Element) {
                childHtml += sanitizeElement(child, depth + 1);
              }
            }

            // Build tag
            if (childHtml || textContent) {
              return `<${tag}${attrStr ? ' ' + attrStr : ''}>${textContent}${childHtml}</${tag}>`;
            } else {
              return `<${tag}${attrStr ? ' ' + attrStr : ''} />`;
            }
          };

          const body = document.body;
          return sanitizeElement(body);
        },
        includeAttributes
      );
    } else if (strategy === 'accessibility') {
      html = await page.evaluate(() => {
        const walkAccessibilityTree = (el: Element, depth = 0): string => {
          if (depth > 8) return '';

          const tag = el.tagName.toLowerCase();
          const role = el.getAttribute('role') || '';
          const ariaLabel = el.getAttribute('aria-label') || '';
          const text = (el.textContent || '').trim().substring(0, 100);

          if (
            ['script', 'style', 'meta', 'link', 'noscript'].includes(tag)
          ) {
            return '';
          }

          let result = `<${tag}${role ? ` role="${role}"` : ''}${ariaLabel ? ` aria-label="${ariaLabel}"` : ''}>${text}`;

          for (const child of Array.from(el.children)) {
            if (child instanceof Element) {
              result += walkAccessibilityTree(child, depth + 1);
            }
          }

          result += `</${tag}>`;
          return result;
        };

        return walkAccessibilityTree(document.body);
      });
    } else {
      // Full strategy - include most elements
      html = await page.content();
    }

    // Estimate tokens (rough: ~4 chars per token)
    const estimatedTokens = Math.ceil(html.length / 4);
    let truncated = false;

    // Truncate if too long
    if (estimatedTokens > maxTokens) {
      const targetLength = (maxTokens * 4 * 0.8) | 0; // 80% of max
      html = html.substring(0, targetLength) + '\n<!-- TRUNCATED -->';
      truncated = true;
    }

    // Extract interactive elements if requested
    let interactiveElements: InteractiveElement[] = [];
    if (includeInteractive) {
      interactiveElements = await extractInteractiveElements(page);
    }

    // Extract text content
    const text = await page.evaluate(() => {
      return (document.body.innerText || '').substring(0, 5000);
    });

    return {
      success: true,
      data: {
        html,
        text,
        truncated,
        estimatedTokens,
        interactiveElements,
      },
      duration: Date.now() - startTime,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'DOM extraction failed',
      duration: Date.now() - startTime,
    };
  }
}

export async function extractInteractiveElements(
  page: Page,
  selector?: string
): Promise<InteractiveElement[]> {
  try {
    const elements = await page.evaluate((baseSelector) => {
      const scope = baseSelector ? document.querySelector(baseSelector) : document;
      if (!scope) return [];

      const interactive: any[] = [];

      // Find all buttons
      scope.querySelectorAll('button').forEach((el) => {
        const rect = el.getBoundingClientRect();
        interactive.push({
          selector: getSelector(el),
          type: 'button',
          text: el.textContent?.trim() || '',
          visible: rect.height > 0 && rect.width > 0,
          ariaLabel: el.getAttribute('aria-label') || undefined,
        });
      });

      // Find all links
      scope.querySelectorAll('a[href]').forEach((el) => {
        const rect = el.getBoundingClientRect();
        interactive.push({
          selector: getSelector(el),
          type: 'link',
          text: el.textContent?.trim() || '',
          visible: rect.height > 0 && rect.width > 0,
          ariaLabel: el.getAttribute('aria-label') || undefined,
        });
      });

      // Find all input elements
      scope.querySelectorAll('input, select, textarea').forEach((el) => {
        const rect = el.getBoundingClientRect();
        interactive.push({
          selector: getSelector(el),
          type: (el as any).type || 'input',
          text: (el as HTMLInputElement).placeholder || '',
          visible: rect.height > 0 && rect.width > 0,
          ariaLabel: el.getAttribute('aria-label') || undefined,
        });
      });

      return interactive;

      function getSelector(el: Element): string {
        if (el.id) return `#${el.id}`;
        const classes = Array.from(el.classList)
          .filter((c) => !c.startsWith('_'))
          .join('.');
        if (classes) return `.${classes}`;
        return el.tagName.toLowerCase();
      }
    }, selector);

    return elements;
  } catch (error) {
    console.error('Failed to extract interactive elements:', error);
    return [];
  }
}

export async function getTextContent(
  page: Page,
  maxLength: number = 5000
): Promise<ToolOutput<{ text: string }>> {
  const startTime = Date.now();

  try {
    const text = await page.evaluate((max) => {
      return (document.body.innerText || '').substring(0, max);
    }, maxLength);

    return {
      success: true,
      data: { text },
      duration: Date.now() - startTime,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Get text content failed',
      duration: Date.now() - startTime,
    };
  }
}

export async function getPageTitle(page: Page): Promise<ToolOutput<{ title: string }>> {
  const startTime = Date.now();

  try {
    const title = await page.title();

    return {
      success: true,
      data: { title },
      duration: Date.now() - startTime,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Get title failed',
      duration: Date.now() - startTime,
    };
  }
}

export async function getPageUrl(page: Page): Promise<ToolOutput<{ url: string }>> {
  const startTime = Date.now();

  try {
    const url = page.url();

    return {
      success: true,
      data: { url },
      duration: Date.now() - startTime,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Get URL failed',
      duration: Date.now() - startTime,
    };
  }
}

export async function takeScreenshot(
  page: Page,
  path?: string,
  fullPage: boolean = false
): Promise<ToolOutput<{ screenshot: Buffer; path?: string }>> {
  const startTime = Date.now();

  try {
    const screenshot = await page.screenshot({ fullPage, path });

    return {
      success: true,
      data: { screenshot, path },
      duration: Date.now() - startTime,
      screenshot: screenshot as Buffer,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Screenshot failed',
      duration: Date.now() - startTime,
    };
  }
}
