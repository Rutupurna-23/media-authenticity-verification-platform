import crypto from 'crypto';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface StructuredLog {
  timestamp: string;
  level: LogLevel;
  correlationId?: string;
  message: string;
  method?: string;
  path?: string;
  statusCode?: number;
  durationMs?: number;
  error?: {
    message: string;
    code?: string | number;
    stack?: string;
  };
  context?: Record<string, any>;
}

// Sensitive fields to redact from logs
const SENSITIVE_KEYS = new Set([
  'authorization',
  'password',
  'token',
  'apikey',
  'api_key',
  'gemini_api_key',
  'privatekey',
  'private_key',
  'secret',
  'service_account',
  'credentials',
  'signature',
]);

export function sanitizeLogContext(data: any): any {
  if (data === null || data === undefined) return data;
  if (typeof data !== 'object') return data;

  if (Array.isArray(data)) {
    return data.map(sanitizeLogContext);
  }

  const sanitized: Record<string, any> = {};
  for (const [key, value] of Object.entries(data)) {
    const lowerKey = key.toLowerCase().replace(/[^a-z0-9_]/g, '');
    if (SENSITIVE_KEYS.has(lowerKey) || lowerKey.includes('secret') || lowerKey.includes('key') || lowerKey.includes('token') || lowerKey.includes('password')) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeLogContext(value);
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

class Logger {
  private isProduction = process.env.NODE_ENV === 'production';

  private emit(log: StructuredLog) {
    const output = JSON.stringify(log);
    if (log.level === 'error') {
      console.error(output);
    } else if (log.level === 'warn') {
      console.warn(output);
    } else {
      console.log(output);
    }
  }

  log(level: LogLevel, message: string, meta?: Partial<StructuredLog>) {
    const entry: StructuredLog = {
      timestamp: new Date().toISOString(),
      level,
      message,
      correlationId: meta?.correlationId || crypto.randomUUID(),
      method: meta?.method,
      path: meta?.path,
      statusCode: meta?.statusCode,
      durationMs: meta?.durationMs !== undefined ? Math.max(0, Number(meta.durationMs.toFixed(2))) : undefined,
      error: meta?.error ? {
        message: meta.error.message,
        code: meta.error.code,
        // Hide internal stack trace in production logs unless explicit debug mode
        stack: this.isProduction ? undefined : meta.error.stack,
      } : undefined,
      context: meta?.context ? sanitizeLogContext(meta.context) : undefined,
    };

    this.emit(entry);
    return entry;
  }

  info(message: string, meta?: Partial<StructuredLog>) {
    return this.log('info', message, meta);
  }

  warn(message: string, meta?: Partial<StructuredLog>) {
    return this.log('warn', message, meta);
  }

  error(message: string, error?: Error | any, meta?: Partial<StructuredLog>) {
    return this.log('error', message, {
      ...meta,
      error: error instanceof Error ? {
        message: error.message,
        stack: error.stack,
      } : typeof error === 'string' ? { message: error } : undefined,
    });
  }

  debug(message: string, meta?: Partial<StructuredLog>) {
    if (!this.isProduction || process.env.DEBUG) {
      return this.log('debug', message, meta);
    }
  }
}

export const logger = new Logger();
