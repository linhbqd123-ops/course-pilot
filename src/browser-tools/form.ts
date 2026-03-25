import { Page } from 'playwright';
import {
  FillFormToolInput,
  FormFillResult,
  ExtractFormToolInput,
  FormField,
  ToolOutput,
} from './types.js';
import { getLogger } from '../utils/logger.js';

const logger = getLogger();

export async function fillForm(
  page: Page,
  input: FillFormToolInput
): Promise<ToolOutput<FormFillResult>> {
  const startTime = Date.now();
  logger.info(`[FORM] Filling form with ${input.fields.length} fields...`);

  try {
    const { fields, submitSelector, waitForNavigation = false } = input;

    let fieldsFilled = 0;
    let fieldsFailed = 0;
    const errors: Record<string, string> = {};

    // Fill each field
    for (let i = 0; i < fields.length; i++) {
      const field = fields[i];
      logger.info(`[FORM] Filling field ${i + 1}/${fields.length}: ${field.selector}...`);
      try {
        const locator = page.locator(field.selector);
        await locator.waitFor({ state: 'visible', timeout: 5000 });

        const elementType = await locator.evaluate((el: HTMLElement) => {
          if (el instanceof HTMLSelectElement) return 'select';
          if (el instanceof HTMLTextAreaElement) return 'textarea';
          if (el instanceof HTMLInputElement) return el.type;
          return 'unknown';
        });

        logger.info(`[FORM] Element type: ${elementType}, Value: ${String(field.value).substring(0, 50)}`);

        if (elementType === 'select') {
          // Handle select elements
          await locator.selectOption(String(field.value));
        } else if (elementType === 'checkbox') {
          const isChecked = await locator.isChecked();
          if ((field.value && !isChecked) || (!field.value && isChecked)) {
            await locator.click();
          }
        } else if (elementType === 'radio') {
          await locator.click();
        } else {
          // Text inputs
          await locator.clear();
          await locator.type(String(field.value), { delay: 10 });
        }

        fieldsFilled++;
        logger.info(`[FORM] Field ${i + 1} filled successfully`);
      } catch (error) {
        fieldsFailed++;
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        errors[field.selector] = errorMsg;
        logger.warn(`[FORM] Field ${i + 1} failed: ${errorMsg}`);
      }
    }

    // Submit form if selector provided
    if (submitSelector) {
      logger.info(`[FORM] Submitting form...`);
      try {
        await page.locator(submitSelector).click();
        logger.info(`[FORM] Form submit button clicked`);

        if (waitForNavigation) {
          logger.info(`[FORM] Waiting for page navigation after submit...`);
          await page.waitForLoadState('networkidle', { timeout: 30000 });
          logger.info(`[FORM] Navigation complete after submit`);
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Submit failed';
        errors['submit'] = errorMsg;
        logger.error(`[FORM] Form submission failed: ${errorMsg}`);
      }
    }

    logger.info(`[FORM] Form fill complete. Success: ${fieldsFailed === 0}. Filled: ${fieldsFilled}/${fields.length}, Failed: ${fieldsFailed}`);

    return {
      success: fieldsFailed === 0,
      data: {
        success: fieldsFailed === 0,
        fieldsFilled,
        fieldsFailed,
        errors: Object.keys(errors).length > 0 ? errors : undefined,
      },
      duration: Date.now() - startTime,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Fill form failed';
    logger.error(`[FORM] Fill form operation failed: ${errorMsg}`);
    return {
      success: false,
      error: errorMsg,
      duration: Date.now() - startTime,
      data: {
        success: false,
        fieldsFilled: 0,
        fieldsFailed: 0,
      },
    };
  }
}

export async function extractFormFields(
  page: Page,
  input: ExtractFormToolInput
): Promise<ToolOutput<{ fields: FormField[] }>> {
  const startTime = Date.now();
  logger.info(`[FORM] Extracting form fields...`);

  try {
    const { formSelector } = input;

    const fields = await page.evaluate((selector) => {
      const form = selector ? document.querySelector(selector) : document;
      if (!form) return [];

      const fields: any[] = [];

      // Extract all form inputs
      form.querySelectorAll('input, select, textarea, button[type="submit"]').forEach((el) => {
        const field: any = {
          selector: getSelector(el),
          type: el.tagName.toLowerCase(),
        };

        if (el instanceof HTMLInputElement) {
          field.type = el.type || 'text';
          field.name = el.name;
          field.placeholder = el.placeholder;
          field.required = el.required;
          field.value = el.value;
        } else if (el instanceof HTMLSelectElement) {
          field.type = 'select';
          field.name = el.name;
          field.required = el.required;
          field.options = Array.from(el.options).map((o) => o.value);
          field.value = el.value;
        } else if (el instanceof HTMLTextAreaElement) {
          field.type = 'textarea';
          field.name = el.name;
          field.placeholder = el.placeholder;
          field.required = el.required;
          field.value = el.value;
        } else if (el instanceof HTMLButtonElement) {
          field.type = 'submit';
          field.text = el.textContent?.trim();
        }

        // Get associated label
        const label = form.querySelector(`label[for="${el.id}"]`);
        if (label) {
          field.label = label.textContent?.trim();
        }

        fields.push(field);
      });

      return fields;

      function getSelector(el: Element): string {
        if (el.id) return `#${el.id}`;
        if (el instanceof HTMLInputElement && el.name) return `input[name="${el.name}"]`;
        if (el instanceof HTMLSelectElement && el.name) return `select[name="${el.name}"]`;
        const classes = Array.from(el.classList)
          .filter((c) => !c.startsWith('_'))
          .join('.');
        if (classes) return `.${classes}`;
        return el.tagName.toLowerCase();
      }
    }, formSelector);

    logger.info(`[FORM] Found ${fields.length} form fields`);
    fields.forEach((f, i) => {
      logger.info(`[FORM] Field ${i + 1}: ${f.type} - ${f.name || f.selector}`);
    });

    return {
      success: true,
      data: { fields },
      duration: Date.now() - startTime,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Extract form fields failed';
    logger.error(`[FORM] Extract form fields failed: ${errorMsg}`);
    return {
      success: false,
      error: errorMsg,
      duration: Date.now() - startTime,
      data: { fields: [] },
    };
  }
}

export async function extractQuizQuestions(
  page: Page
): Promise<ToolOutput<{ questions: any[] }>> {
  const startTime = Date.now();
  logger.info(`[FORM] Extracting quiz questions...`);

  try {
    const questions = await page.evaluate(() => {
      const questions: any[] = [];

      // Try to find quiz question elements (common selectors)
      const questionSelectors = [
        '.question',
        '[data-question]',
        '.quiz-question',
        '.qa-block',
        '[class*="question"]',
      ];

      for (const selector of questionSelectors) {
        const items = document.querySelectorAll(selector);
        if (items.length === 0) continue;

        items.forEach((item, idx) => {
          const questionText =
            item.querySelector('[class*="text"], [class*="title"], [class*="question"]')
              ?.textContent || '';

          // Find options
          const optionElements = item.querySelectorAll(
            '[type="radio"], [type="checkbox"], .option, [data-option]'
          );

          const options: string[] = [];
          optionElements.forEach((opt) => {
            const label =
              opt instanceof HTMLInputElement && opt.parentElement
                ? opt.parentElement.textContent?.trim() || ''
                : opt.textContent?.trim() || '';
            if (label) options.push(label);
          });

          questions.push({
            number: idx + 1,
            text: questionText.trim(),
            type: 'multiple-choice',
            options: options.length > 0 ? options : undefined,
          });
        });

        if (questions.length > 0) break;
      }

      return questions;
    });

    logger.info(`[FORM] Found ${questions.length} quiz questions`);
    questions.forEach((q) => {
      logger.info(`[FORM] Question ${q.number}: ${q.text.substring(0, 60)}... (${q.options?.length || 0} options)`);
    });

    return {
      success: true,
      data: { questions },
      duration: Date.now() - startTime,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Extract quiz questions failed';
    logger.error(`[FORM] Extract quiz questions failed: ${errorMsg}`);
    return {
      success: false,
      error: errorMsg,
      duration: Date.now() - startTime,
      data: { questions: [] },
    };
  }
}
