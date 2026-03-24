import { getLogger } from './logger.js';

const logger = getLogger();

export interface RetryOptions {
  maxRetries: number;
  delayMs: number;
  multiplier?: number;
  maxDelayMs?: number;
}

/**
 * Retry a function with exponential backoff
 */
export async function retry<T>(
  fn: () => Promise<T>,
  options: RetryOptions
): Promise<T> {
  let lastError: Error | null = null;
  let delay = options.delayMs;

  for (let attempt = 0; attempt <= options.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt < options.maxRetries) {
        logger.warn(
          `Attempt ${attempt + 1}/${options.maxRetries} failed (${lastError.message}), retrying in ${delay}ms`
        );
        await new Promise((resolve) => setTimeout(resolve, delay));

        // Exponential backoff
        if (options.multiplier) {
          delay = Math.min(delay * options.multiplier, options.maxDelayMs || 30000);
        }
      }
    }
  }

  throw lastError || new Error('Retry failed with unknown error');
}

/**
 * Retry with linear backoff
 */
export async function retryLinear<T>(
  fn: () => Promise<T>,
  maxRetries: number,
  delayMs: number
): Promise<T> {
  return retry(fn, { maxRetries, delayMs, multiplier: 1 });
}

/**
 * Retry with exponential backoff (2x multiplier)
 */
export async function retryExponential<T>(
  fn: () => Promise<T>,
  maxRetries: number,
  initialDelayMs: number = 1000
): Promise<T> {
  return retry(fn, {
    maxRetries,
    delayMs: initialDelayMs,
    multiplier: 2,
    maxDelayMs: 30000,
  });
}

/**
 * Wrap a function to retry on specific error types
 */
export function retryOnError<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  maxRetries: number = 3,
  delayMs: number = 1000,
  errorFilter?: (error: any) => boolean
): T {
  return (async (...args: any[]) => {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn(...args);
      } catch (error) {
        if (errorFilter && !errorFilter(error)) {
          throw error;
        }

        if (attempt < maxRetries) {
          logger.debug(`Retrying (${attempt + 1}/${maxRetries})...`);
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        } else {
          throw error;
        }
      }
    }
  }) as T;
}
