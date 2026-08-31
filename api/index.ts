import type { IncomingMessage, ServerResponse } from 'http';
import { createApp } from '../server.js';

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    const app = await createApp();
    return app(req, res);
  } catch (error: any) {
    console.error('Vercel Serverless Function Runtime Exception:', error);

    const httpRes = res as any;
    if (typeof httpRes.status === 'function') {
      return httpRes.status(500).json({
        error: 'INTERNAL_SERVER_ERROR',
        message: error?.message || 'An unexpected serverless runtime error occurred.',
        timestamp: new Date().toISOString(),
      });
    }

    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          error: 'INTERNAL_SERVER_ERROR',
          message: error?.message || 'An unexpected serverless runtime error occurred.',
          timestamp: new Date().toISOString(),
        })
      );
    }
  }
}
