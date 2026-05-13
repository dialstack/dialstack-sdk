// Webhook handler: DialStack calls this URL when a Voice App (Control) node
// receives a call. We verify the HMAC signature, then issue an `attach`
// action that points DialStack back at our /media WebSocket.

import type { Request, Response } from 'express';
import { DialStack } from '@dialstack/sdk/server';
import type { WebhookEvent } from '@dialstack/sdk/server';
import { logger } from './logger.js';

export interface WebhookConfig {
  /** DialStack API base URL (e.g. https://api.dialstack.ai). */
  apiBase: string;
  /** DialStack API key (sk_live_… / sk_test_…). */
  apiKey: string;
  /** HMAC secret configured on the Voice App. */
  webhookSecret: string;
  /** Public wss:// URL of this server's /media endpoint. */
  mediaWsUrl: string;
}

export function makeWebhookHandler(cfg: WebhookConfig) {
  const ds = new DialStack(cfg.apiKey, { apiUrl: cfg.apiBase });
  const log = logger.child({ component: 'webhook' });

  return async (req: Request, res: Response): Promise<void> => {
    let event: WebhookEvent & { event: string };
    try {
      // `express.raw()` populates req.body as a Buffer; constructEvent expects
      // the raw payload (NOT the parsed JSON) so the HMAC math lines up.
      event = DialStack.webhooks.constructEvent<WebhookEvent & { event: string }>(
        req.body as Buffer,
        String(req.header('x-dialstack-signature') ?? ''),
        cfg.webhookSecret,
      );
    } catch (err) {
      log.warn({ err }, 'webhook signature verification failed');
      res.status(400).send('invalid signature');
      return;
    }

    log.info({ event: event.event, call_id: event.call_id }, 'webhook received');

    if (event.event !== 'call.received') {
      // For this example we only handle Control-mode webhooks. Notify-mode
      // (call.notify) would need the Listeners API instead.
      res.status(200).end();
      return;
    }

    try {
      await ds.calls.update(
        event.call_id,
        { actions: [{ type: 'attach' as const, url: cfg.mediaWsUrl }] },
        { dialstackAccount: event.account_id },
      );
    } catch (err) {
      log.error({ err }, 'POST /v1/calls/{id} failed');
      res.status(502).send('failed to attach');
      return;
    }

    res.status(200).end();
  };
}
