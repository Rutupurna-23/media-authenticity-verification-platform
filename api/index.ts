import type { IncomingMessage, ServerResponse } from 'http';
import { createApp } from '../server.js';

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  return new Promise<void>(async (resolve) => {
    try {
      if (req.url && req.url.startsWith('/api/index.ts')) {
        const urlObj = new URL(req.url, 'http://localhost');
        const realPath = urlObj.searchParams.get('path') || urlObj.searchParams.get('url');
        if (realPath) {
          req.url = realPath.startsWith('/api') ? realPath : `/api${realPath}`;
        }
      }

      res.on('finish', () => resolve());
      res.on('close', () => resolve());
      res.on('error', (err) => {
        console.error('Vercel response stream error:', err);
        resolve();
      });

      const app = await createApp();
      app(req, res);
    } catch (error: any) {
      console.error('Vercel Serverless Function Runtime Exception:', error);

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
      resolve();
    }
  });
}
