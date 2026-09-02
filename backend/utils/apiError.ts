import { Response } from 'express';
import crypto from 'crypto';
import { logger } from './logger.js';

export type ApiErrorCode =
  | 'INVALID_ARGUMENT'
  | 'FILE_TYPE_MISMATCH'
  | 'MAGIC_BYTES_REJECTED'
  | 'UNAUTHENTICATED'
  | 'PERMISSION_DENIED'
  | 'TENANT_ISOLATION_VIOLATION'
  | 'RESOURCE_NOT_FOUND'
  | 'CREDENTIAL_NOT_FOUND'
  | 'CREDENTIAL_NOT_ACTIVE'
  | 'CREDENTIAL_REVOKED'
  | 'CREDENTIAL_EXPIRED'
  | 'FILE_TOO_LARGE'
  | 'UNSUPPORTED_MEDIA_TYPE'
  | 'RATE_LIMITED'
  | 'INTERNAL_SERVER_ERROR'
  | 'STORAGE_UNAVAILABLE';

export interface ApiErrorResponse {
  success: false;
  error: {
    code: ApiErrorCode;
    message: string;
    requestId: string;
    timestamp: string;
  };
}

export function sendApiError(
  res: Response,
  statusCode: number,
  code: ApiErrorCode,
  message: string,
  meta?: Record<string, any>
): Response {
  const requestId = (meta?.requestId as string) || (res.getHeader('x-correlation-id') as string) || crypto.randomUUID();
  const timestamp = new Date().toISOString();

  logger.warn(`API Error [${statusCode}] ${code}: ${message}`, {
    statusCode,
    correlationId: requestId,
    context: { code, message, ...meta },
  });

  const body: ApiErrorResponse = {
    success: false,
    error: {
      code,
      message,
      requestId,
      timestamp,
    },
  };

  return res.status(statusCode).json(body);
}
