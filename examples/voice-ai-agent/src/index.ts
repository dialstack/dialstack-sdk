#!/usr/bin/env node
// CLI entry point.
//
//   voice-ai-agent --provider <elevenlabs|gemini> [--port 8080]
//
// All other configuration comes from environment variables (see .env.example).
// We intentionally keep the CLI surface tiny — provider choice is the one
// thing you actually want to flip at run time when developing.

import 'dotenv/config';
import { parseArgs } from 'node:util';
import { logger } from './logger.js';
import { startServer } from './server.js';
import { ElevenLabsProvider } from './providers/elevenlabs.js';
import { GeminiProvider } from './providers/gemini.js';
import type { VoiceProvider } from './providers/provider.js';

function main(): void {
  const { values } = parseArgs({
    options: {
      provider: { type: 'string', short: 'p' },
      port: { type: 'string' },
      help: { type: 'boolean', short: 'h' },
    },
  });

  if (values.help) {
    printUsage();
    return;
  }

  const provider = values.provider;
  if (provider !== 'elevenlabs' && provider !== 'gemini') {
    printUsage();
    process.exit(1);
  }

  const port = Number(values.port ?? process.env.PORT ?? 8080);
  const publicUrl = required('PUBLIC_URL').replace(/\/$/, '');
  const mediaWsUrl = `${publicUrl.replace(/^http/, 'ws')}/media`;

  const makeProvider = providerFactory(provider);

  startServer({
    port,
    webhook: {
      apiBase: process.env.DIALSTACK_API_BASE ?? 'https://api.dialstack.ai',
      apiKey: required('DIALSTACK_API_KEY'),
      webhookSecret: required('VOICE_APP_WEBHOOK_SECRET'),
      mediaWsUrl,
    },
    makeProvider,
  });

  logger.info({ provider, publicUrl, mediaWsUrl }, 'voice-ai-agent ready');
}

function providerFactory(name: 'elevenlabs' | 'gemini'): () => VoiceProvider {
  if (name === 'elevenlabs') {
    const apiKey = required('ELEVENLABS_API_KEY');
    const agentId = required('ELEVENLABS_AGENT_ID');
    return () => new ElevenLabsProvider({ apiKey, agentId });
  }
  // Gemini provider reads its own env vars at connect() time so we can
  // surface helpful error messages there rather than at startup.
  return () => new GeminiProvider();
}

function required(name: string): string {
  const v = process.env[name];
  if (!v) {
    logger.error({ env: name }, 'missing required env var');
    process.exit(1);
  }
  return v;
}

function printUsage(): void {
  process.stdout.write(
    `Usage: voice-ai-agent --provider <elevenlabs|gemini> [--port 8080]\n\n` +
      `Required env vars (see .env.example):\n` +
      `  PUBLIC_URL, DIALSTACK_API_KEY, VOICE_APP_WEBHOOK_SECRET\n` +
      `  ElevenLabs: ELEVENLABS_API_KEY, ELEVENLABS_AGENT_ID\n` +
      `  Gemini:     GEMINI_API_KEY   (or GOOGLE_GENAI_USE_VERTEXAI=true + GOOGLE_CLOUD_PROJECT)\n`,
  );
}

main();
