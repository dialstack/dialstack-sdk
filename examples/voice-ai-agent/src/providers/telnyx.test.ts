import assert from 'node:assert/strict';
import { test } from 'node:test';

import WebSocket from 'ws';

import { TelnyxProvider } from './telnyx.js';

// Drives the provider's message handling without a network: frames go in as
// Telnyx would send them, and what the provider sends back is captured.
function harness() {
  const p = new TelnyxProvider({ apiKey: 'k', assistantId: 'a' });
  const sent: unknown[] = [];
  const internals = p as unknown as { ws: unknown; handleMessage(text: string): void };
  internals.ws = { readyState: WebSocket.OPEN, send: (s: string) => sent.push(JSON.parse(s)) };
  const transcripts: { role: string; text: string }[] = [];
  p.on('transcript', (role, text) => transcripts.push({ role, text }));
  return { p, sent, transcripts, recv: (msg: object) => internals.handleMessage(JSON.stringify(msg)) };
}

test('the caller turn is reported once its transcription completes', () => {
  const h = harness();
  h.recv({ type: 'conversation.item.input_audio_transcription.completed', transcript: 'I need help with my bill' });
  assert.deepEqual(h.transcripts, [{ role: 'caller', text: 'I need help with my bill' }]);
});

test('the agent turn is assembled from its deltas and reported when the response completes', () => {
  const h = harness();
  h.recv({ type: 'response.created', response: { id: 'r1' } });
  h.recv({ type: 'response.output_audio_transcript.delta', response_id: 'r1', delta: 'Sure, ' });
  h.recv({ type: 'response.output_audio_transcript.delta', response_id: 'r1', delta: 'one moment.' });
  assert.deepEqual(h.transcripts, []);
  h.recv({ type: 'response.done', response: { id: 'r1', status: 'completed' } });
  assert.deepEqual(h.transcripts, [{ role: 'agent', text: 'Sure, one moment.' }]);
});

test('an agent turn the caller cut off is reported as generated so far', () => {
  const h = harness();
  h.recv({ type: 'response.created', response: { id: 'r1' } });
  h.recv({ type: 'response.output_audio_transcript.delta', response_id: 'r1', delta: 'Our hours are' });
  h.recv({ type: 'response.done', response: { id: 'r1', status: 'cancelled' } });
  assert.deepEqual(h.transcripts, [{ role: 'agent', text: 'Our hours are' }]);
});

test('an empty turn is not reported', () => {
  const h = harness();
  h.recv({ type: 'conversation.item.input_audio_transcription.completed', transcript: '  ' });
  h.recv({ type: 'response.created', response: { id: 'r1' } });
  h.recv({ type: 'response.done', response: { id: 'r1', status: 'completed' } });
  assert.deepEqual(h.transcripts, []);
});

test('sendText sends a user text turn and asks the assistant to answer it', () => {
  const h = harness();
  h.recv({ type: 'session.created', session: { audio: { output: { format: { rate: 16000 } } } } });
  h.p.sendText('Brief the person who answered.');
  assert.deepEqual(h.sent, [
    {
      type: 'conversation.item.create',
      item: { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'Brief the person who answered.' }] },
    },
    { type: 'response.create' },
  ]);
});

test('sendText before the session is ready sends nothing', () => {
  const h = harness();
  h.p.sendText('too early');
  assert.deepEqual(h.sent, []);
});

test('a late delta or done from an interrupted response does not touch the next turn', () => {
  const h = harness();
  h.recv({ type: 'response.created', response: { id: 'r1' } });
  h.recv({ type: 'response.output_audio_transcript.delta', response_id: 'r1', delta: 'Our hours' });
  h.recv({ type: 'response.created', response: { id: 'r2' } });
  h.recv({ type: 'response.output_audio_transcript.delta', response_id: 'r1', delta: ' are nine' });
  h.recv({ type: 'response.output_audio_transcript.delta', response_id: 'r2', delta: 'Go ahead.' });
  h.recv({ type: 'response.done', response: { id: 'r1', status: 'cancelled' } });
  assert.deepEqual(h.transcripts, []);
  h.recv({ type: 'response.done', response: { id: 'r2', status: 'completed' } });
  assert.deepEqual(h.transcripts, [{ role: 'agent', text: 'Go ahead.' }]);
});
