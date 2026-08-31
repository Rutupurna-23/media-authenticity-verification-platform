/**
 * Environment & Configuration Validator
 * Validates required configuration variables and provides fail-safe defaults for development
 * while enforcing strict validation in production.
 */

export interface AppConfig {
  nodeEnv: string;
  port: number;
  firebaseProjectId: string;
  rateLimitWindowMs: number;
  rateLimitMaxRequests: number;
  geminiApiKey?: string;
  geminiTimeoutMs: number;
  allowedOrigins: string[];
  isProduction: boolean;
}

export function validateConfig(env: Record<string, string | undefined> = process.env): {
  isValid: boolean;
  config: AppConfig;
  warnings: string[];
  errors: string[];
} {
  const warnings: string[] = [];
  const errors: string[] = [];

  const nodeEnv = env.NODE_ENV || 'development';
  const isProduction = nodeEnv === 'production';

  const port = parseInt(env.PORT || '3000', 10);
  if (isNaN(port) || port < 1 || port > 65535) {
    errors.push(`Invalid PORT configuration: "${env.PORT}". Must be between 1 and 65535.`);
  }

  const firebaseProjectId = env.FIREBASE_PROJECT_ID || env.GCLOUD_PROJECT || 'media-authenticity-dev';
  if (isProduction && (!env.FIREBASE_PROJECT_ID && !env.GCLOUD_PROJECT)) {
    warnings.push('FIREBASE_PROJECT_ID or GCLOUD_PROJECT is not explicitly defined in production environment.');
  }

  const rateLimitWindowMs = parseInt(env.RATE_LIMIT_WINDOW_MS || '60000', 10);
  if (isNaN(rateLimitWindowMs) || rateLimitWindowMs <= 0) {
    errors.push('RATE_LIMIT_WINDOW_MS must be a positive integer.');
  }

  const rateLimitMaxRequests = parseInt(env.RATE_LIMIT_MAX_REQUESTS || '100', 10);
  if (isNaN(rateLimitMaxRequests) || rateLimitMaxRequests <= 0) {
    errors.push('RATE_LIMIT_MAX_REQUESTS must be a positive integer.');
  }

  const geminiTimeoutMs = parseInt(env.GEMINI_TIMEOUT_MS || '10000', 10);
  if (isNaN(geminiTimeoutMs) || geminiTimeoutMs < 1000) {
    errors.push('GEMINI_TIMEOUT_MS must be at least 1000ms.');
  }

  const allowedOriginsStr = env.ALLOWED_ORIGINS || '';
  const allowedOrigins = allowedOriginsStr
    ? allowedOriginsStr.split(',').map((s) => s.trim())
    : ['http://localhost:3000', 'http://localhost:5173', 'http://127.0.0.1:3000', 'http://127.0.0.1:5173'];

  if (isProduction && allowedOrigins.includes('*')) {
    warnings.push('Wildcard origin "*" in ALLOWED_ORIGINS is not recommended for production environments.');
  }

  const config: AppConfig = {
    nodeEnv,
    port,
    firebaseProjectId,
    rateLimitWindowMs,
    rateLimitMaxRequests,
    geminiApiKey: env.GEMINI_API_KEY || env.API_KEY || env.VITE_GEMINI_API_KEY,
    geminiTimeoutMs,
    allowedOrigins,
    isProduction,
  };

  return {
    isValid: errors.length === 0,
    config,
    warnings,
    errors,
  };
}

export const appConfig = validateConfig().config;
