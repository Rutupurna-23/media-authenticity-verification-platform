import type { IncomingMessage, ServerResponse } from 'http';
import { createApp } from '../server.js';

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const app = await createApp();
  return app(req, res);
}
