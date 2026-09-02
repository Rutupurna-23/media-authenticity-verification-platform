import type { IncomingMessage, ServerResponse } from 'http';
import { createApp } from '../server.js';

let cachedApp: any = null;

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    if (!cachedApp) {
      cachedApp = await createApp();
    }
    return cachedApp(req, res);
  } catch (error: any) {
    console.error('[Vercel Handler Error]', error);
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          error: 'INTERNAL_SERVER_ERROR',
          message: error?.message || 'An unexpected serverless error occurred.',
        })
      );
    }
  }
}
