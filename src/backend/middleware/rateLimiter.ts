import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger.js';

interface RateLimitOptions {
  windowMs?: number;
  maxRequests?: number;
  message?: string;
  skip?: (req: Request) => boolean;
}

interface ClientBucket {
  timestamps: number[];
}

export class SlidingWindowRateLimiter {
  private buckets = new Map<string, ClientBucket>();
  private windowMs: number;
  private maxRequests: number;
  private message: string;
  private cleanupTimer: NodeJS.Timeout | null = null;

  constructor(options: RateLimitOptions = {}) {
    this.windowMs = options.windowMs || (process.env.RATE_LIMIT_WINDOW_MS ? parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) : 60 * 1000); // default 1 minute
    this.maxRequests = options.maxRequests || (process.env.RATE_LIMIT_MAX_REQUESTS ? parseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 10) : 60); // default 60 req/min
    this.message = options.message || 'Too many requests, please try again later.';

    // Run garbage collection every 2 minutes
    this.cleanupTimer = setInterval(() => this.cleanup(), 2 * 60 * 1000);
    if (this.cleanupTimer.unref) {
      this.cleanupTimer.unref();
    }
  }

  private getClientKey(req: Request): string {
    const auth = (req as any).auth;
    if (auth && auth.uid) {
      return `auth_${auth.uid}_${auth.institutionId || 'public'}`;
    }
    const forwarded = req.headers['x-forwarded-for'];
    const ip = typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : req.socket.remoteAddress || 'unknown-ip';
    return `ip_${ip}`;
  }

  private cleanup() {
    const now = Date.now();
    for (const [key, bucket] of this.buckets.entries()) {
      bucket.timestamps = bucket.timestamps.filter((t) => now - t < this.windowMs);
      if (bucket.timestamps.length === 0) {
        this.buckets.delete(key);
      }
    }
  }

  public check(key: string, now: number = Date.now()): {
    allowed: boolean;
    limit: number;
    remaining: number;
    resetEpochSeconds: number;
    retryAfterSeconds: number;
  } {
    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = { timestamps: [] };
      this.buckets.set(key, bucket);
    }

    // Filter out timestamps outside current sliding window
    bucket.timestamps = bucket.timestamps.filter((t) => now - t < this.windowMs);

    const limit = this.maxRequests;
    const currentCount = bucket.timestamps.length;
    const oldestTimestamp = bucket.timestamps[0] || now;
    const resetTimeMs = oldestTimestamp + this.windowMs;
    const retryAfterSeconds = Math.max(1, Math.ceil((resetTimeMs - now) / 1000));
    const resetEpochSeconds = Math.ceil(resetTimeMs / 1000);

    if (currentCount >= limit) {
      return {
        allowed: false,
        limit,
        remaining: 0,
        resetEpochSeconds,
        retryAfterSeconds,
      };
    }

    bucket.timestamps.push(now);
    const remaining = Math.max(0, limit - bucket.timestamps.length);

    return {
      allowed: true,
      limit,
      remaining,
      resetEpochSeconds,
      retryAfterSeconds: 0,
    };
  }

  public middleware() {
    return (req: Request, res: Response, next: NextFunction) => {
      // Do not rate limit health probes
      if (req.path.startsWith('/api/health')) {
        return next();
      }

      const key = this.getClientKey(req);
      const result = this.check(key);

      res.setHeader('X-RateLimit-Limit', result.limit.toString());
      res.setHeader('X-RateLimit-Remaining', result.remaining.toString());
      res.setHeader('X-RateLimit-Reset', result.resetEpochSeconds.toString());

      if (!result.allowed) {
        res.setHeader('Retry-After', result.retryAfterSeconds.toString());
        logger.warn(`Rate limit exceeded for client: ${key}`, {
          path: req.path,
          method: req.method,
          statusCode: 429,
          context: { key, retryAfterSeconds: result.retryAfterSeconds },
        });

        return res.status(429).json({
          error: 'TOO_MANY_REQUESTS',
          message: this.message,
          retryAfterSeconds: result.retryAfterSeconds,
        });
      }

      next();
    };
  }

  public destroy() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.buckets.clear();
  }
}

export function createRateLimiter(options?: RateLimitOptions) {
  return new SlidingWindowRateLimiter(options);
}
