export interface RetryOptions {
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  jitter?: boolean;
  shouldRetry?: (error: any) => boolean;
}

const NON_RETRYABLE_PATTERNS = [
  'UNAUTHENTICATED',
  'PERMISSION_DENIED',
  'INVALID_ARGUMENT',
  'ALREADY_EXISTS',
  'NOT_FOUND',
  'FAILED_PRECONDITION',
  'OUT_OF_RANGE',
  'UNIMPLEMENTED',
  '400',
  '401',
  '403',
  '404',
];

export function isRetryableError(err: any): boolean {
  if (!err) return false;
  const msg = (err.message || String(err)).toUpperCase();
  const code = String(err.code || '');

  // Check if error is explicitly non-retryable
  for (const pattern of NON_RETRYABLE_PATTERNS) {
    if (msg.includes(pattern) || code.includes(pattern)) {
      return false;
    }
  }

  // Common transient network / server errors
  if (
    code === 'ECONNRESET' ||
    code === 'ETIMEDOUT' ||
    code === 'EPIPE' ||
    code === 'ENOTFOUND' ||
    code === 'UNAVAILABLE' ||
    code === 'RESOURCE_EXHAUSTED' ||
    code === 'DEADLINE_EXCEEDED' ||
    msg.includes('503') ||
    msg.includes('502') ||
    msg.includes('504') ||
    msg.includes('TIMEOUT') ||
    msg.includes('NETWORK') ||
    msg.includes('TRANSIENT')
  ) {
    return true;
  }

  return false;
}

export async function retryWithBackoff<T>(
  fn: (attempt: number) => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const maxRetries = options.maxRetries ?? 3;
  const baseDelayMs = options.baseDelayMs ?? 100;
  const maxDelayMs = options.maxDelayMs ?? 3000;
  const useJitter = options.jitter ?? true;
  const shouldRetry = options.shouldRetry ?? isRetryableError;

  let lastError: any;

  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    try {
      return await fn(attempt);
    } catch (err: any) {
      lastError = err;

      if (attempt > maxRetries || !shouldRetry(err)) {
        throw err;
      }

      // Calculate exponential backoff delay: baseDelay * 2^(attempt - 1)
      let delay = Math.min(maxDelayMs, baseDelayMs * Math.pow(2, attempt - 1));
      if (useJitter) {
        // Add random jitter between 0% and 50%
        delay = delay + Math.random() * (delay * 0.5);
      }

      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}
