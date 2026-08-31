/**
 * Bounded Timeout Wrapper
 * Prevents hanging external operations (AI inference, blockchain queries, RPC calls)
 * from indefinitely holding execution threads.
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  operationName: string = 'Operation',
  fallback?: T
): Promise<T> {
  let timer: NodeJS.Timeout | null = null;

  const timeoutPromise = new Promise<T>((resolve, reject) => {
    timer = setTimeout(() => {
      if (fallback !== undefined) {
        resolve(fallback);
      } else {
        const error = new Error(`TIMEOUT: ${operationName} timed out after ${timeoutMs}ms.`);
        (error as any).code = 'ETIMEDOUT';
        reject(error);
      }
    }, timeoutMs);
  });

  try {
    const result = await Promise.race([promise, timeoutPromise]);
    if (timer) clearTimeout(timer);
    return result;
  } catch (err) {
    if (timer) clearTimeout(timer);
    if (fallback !== undefined) {
      return fallback;
    }
    throw err;
  }
}
