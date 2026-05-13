// HTTP + WebSocket server.
//
//   POST /webhook  — DialStack Voice App webhook (HMAC-verified).
//   GET  /media    — DialStack opens this when it processes our `attach`
//                    action; one connection per call.
//   GET  /healthz  — trivial liveness probe.

import http from 'node:http';
import express from 'express';
import { WebSocketServer } from 'ws';
import { MediaStream } from '@dialstack/sdk/server';
import { logger } from './logger.js';
import { makeWebhookHandler, type WebhookConfig } from './webhook.js';
import { runSession } from './session.js';
import type { VoiceProvider } from './providers/provider.js';

export interface ServerOptions {
  port: number;
  webhook: WebhookConfig;
  makeProvider: () => VoiceProvider;
}

export function startServer(opts: ServerOptions): http.Server {
  const app = express();
  const log = logger.child({ component: 'server' });

  app.get('/healthz', (_req, res) => {
    res.status(200).send('ok');
  });

  // express.raw() so the HMAC verifier sees the exact bytes DialStack signed.
  app.post(
    '/webhook',
    express.raw({ type: 'application/json' }),
    makeWebhookHandler(opts.webhook),
  );

  const server = http.createServer(app);
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (req, socket, head) => {
    if (req.url && req.url.startsWith('/media')) {
      wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
    } else {
      socket.destroy();
    }
  });

  wss.on('connection', (ws) => {
    log.info('media WebSocket connection');
    const stream = new MediaStream(ws);
    runSession({ stream, makeProvider: opts.makeProvider });
  });

  server.listen(opts.port, () => {
    log.info({ port: opts.port }, 'listening');
  });

  return server;
}
