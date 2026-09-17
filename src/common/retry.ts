import { logger } from './logger';

export interface RetryOptions {
  attempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  retryOn?: (err: unknown) => boolean;
  label?: string;
}

const DEFAULT: Required<Omit<RetryOptions, 'label' | 'retryOn'>> = {
  attempts: 3,
  baseDelayMs: 1_000,
  maxDelayMs: 30_000,
};

export function isTransient(err: unknown): boolean {
  const msg = (err as Error)?.message ?? '';
  if (/\b(429|500|502|503|504)\b/.test(msg)) return true;
  if (/ECONNRESET|ETIMEDOUT|ENOTFOUND|socket hang up/i.test(msg)) return true;
  if (/rate limit|timeout|temporar/i.test(msg)) return true;
  return false;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: RetryOptions = {},
): Promise<T> {
  const cfg = { ...DEFAULT, ...opts };
  const retryOn = opts.retryOn ?? isTransient;
  let lastErr: unknown;

  for (let attempt = 1; attempt <= cfg.attempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const transient = retryOn(err);
      logger.warn(
        { err: (err as Error).message, attempt, attempts: cfg.attempts, label: opts.label, transient },
        'retry attempt failed',
      );
      if (!transient || attempt === cfg.attempts) break;
      const delay = Math.min(cfg.baseDelayMs * 2 ** (attempt - 1), cfg.maxDelayMs);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}