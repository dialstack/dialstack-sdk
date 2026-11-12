import assert from 'node:assert/strict';
import { test } from 'node:test';

import WebSocket from 'ws';

import { ElevenLabsProvider } from './elevenlabs.js';

function harness() {
  const p = new ElevenLabsProvider({ apiKey: 'k', agentId: 'a' });
  const sent: unknown[] = [];
  const internals = p as unknown as { ws: unknown };
  internals.ws = { readyState: WebSocket.OPEN, send: (s: string) => sent.push(JSON.parse(s)) };
  return { p, sent, internals };
}

const READY = {
  type: 'conversation_initiation_metadata',
  conversation_initiation_metadata_event: {
    user_input_audio_format: 'ulaw_8000',
    agent_output_audio_format: 'ulaw_8000',
  },
};

test('sendText sends a user text turn the agent answers', () => {
  const h = harness();
  (h.p as unknown as { handleMessage(t: string): void }).handleMessage(JSON.stringify(READY));
  h.p.sendText('Brief the person who answered.');
  assert.deepEqual(h.sent, [{ type: 'user_message', text: 'Brief the person who answered.' }]);
});

test('sendText before the socket is open sends nothing', () => {
  const h = harness();
  h.internals.ws = { readyState: WebSocket.CONNECTING, send: () => assert.fail('sent too early') };
  h.p.sendText('too early');
  assert.deepEqual(h.sent, []);
});

test('sendText before the conversation is initiated sends nothing', () => {
  const h = harness();
  h.p.sendText('too early');
  assert.deepEqual(h.sent, []);
});

test('sendText with no socket at all sends nothing and does not throw', () => {
  const h = harness();
  h.internals.ws = undefined;
  h.p.sendText('no socket');
  assert.deepEqual(h.sent, []);
});

function events() {
  const h = harness();
  const internals = h.p as unknown as { handleMessage(text: string): void };
  const transcripts: { role: string; text: string }[] = [];
  h.p.on('transcript', (role, text) => transcripts.push({ role, text }));
  return { ...h, transcripts, recv: (msg: object) => internals.handleMessage(JSON.stringify(msg)) };
}

const userTurn = (user_transcript: string) => ({
  type: 'user_transcript',
  user_transcription_event: { user_transcript },
});

const toolCall = (tool_name: string, parameters: unknown, expects_response = true) => ({
  type: 'client_tool_call',
  client_tool_call: { tool_name, tool_call_id: 't1', parameters, expects_response },
});

test('a client tool other than transfer_to_human goes to the application, and its reply to the agent', () => {
  const h = events();
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  h.p.on('tool', (name, args, reply) => {
    calls.push({ name, args });
    reply({ result: 'Transfer started.' });
  });
  h.recv(toolCall('warm_transfer', { extension: '1002' }));
  assert.deepEqual(calls, [{ name: 'warm_transfer', args: { extension: '1002' } }]);
  assert.deepEqual(h.sent, [
    {
      type: 'client_tool_result',
      tool_call_id: 't1',
      result: JSON.stringify({ result: 'Transfer started.' }),
      is_error: false,
    },
  ]);
});

test('a tool reply carrying an error is sent to the agent as an error', () => {
  const h = events();
  h.p.on('tool', (_name, _args, reply) =>
    reply({ error: 'There is no transfer waiting for an answer.' })
  );
  h.recv(toolCall('accept', {}));
  assert.deepEqual(h.sent, [
    {
      type: 'client_tool_result',
      tool_call_id: 't1',
      result: JSON.stringify({ error: 'There is no transfer waiting for an answer.' }),
      is_error: true,
    },
  ]);
});

test('an unknown client tool with no application listening is refused', () => {
  const h = events();
  h.recv(toolCall('warm_transfer', {}));
  assert.equal((h.sent[0] as { is_error: boolean }).is_error, true);
});

test('the caller turn and the agent turn are reported as transcripts', () => {
  const h = events();
  h.recv({
    type: 'user_transcript',
    user_transcription_event: { user_transcript: 'I need billing' },
  });
  h.recv({ type: 'agent_response', agent_response_event: { agent_response: 'Sure, one moment.' } });
  h.recv(userTurn('Thanks'));
  assert.deepEqual(h.transcripts, [
    { role: 'caller', text: 'I need billing' },
    { role: 'agent', text: 'Sure, one moment.' },
    { role: 'caller', text: 'Thanks' },
  ]);
});

test('voice direction tags are not part of the agent turn', () => {
  const h = events();
  h.recv({
    type: 'agent_response',
    agent_response_event: { agent_response: '[warm] We open at nine. [cheerful] Anything else?' },
  });
  h.recv(userTurn(''));
  assert.deepEqual(h.transcripts, [{ role: 'agent', text: 'We open at nine. Anything else?' }]);
});

test('an empty turn is not reported', () => {
  const h = events();
  h.recv({ type: 'user_transcript', user_transcription_event: { user_transcript: '  ' } });
  h.recv({ type: 'agent_response', agent_response_event: { agent_response: '[warm]' } });
  assert.deepEqual(h.transcripts, []);
});

test('a client tool whose parameters are not an object is refused, not run with none', () => {
  for (const parameters of [null, [], '1002']) {
    const h = events();
    const ran: unknown[] = [];
    h.p.on('transfer', (a) => ran.push(a));
    h.p.on('tool', (name) => ran.push(name));
    h.recv(toolCall('transfer_to_human', parameters));
    h.recv(toolCall('accept', parameters));
    assert.deepEqual(ran, [], JSON.stringify(parameters));
    assert.ok(h.sent.every((m) => (m as { is_error: boolean }).is_error));
  }
});

test('a turn the agent was cut off in is reported as corrected, not as planned', () => {
  const h = events();
  h.recv({
    type: 'agent_response',
    agent_response_event: {
      agent_response: 'Jane is calling about a refund on order 1234, she says',
    },
  });
  h.recv({
    type: 'agent_response_correction',
    agent_response_correction_event: {
      original_agent_response: 'Jane is calling about a refund on order 1234, she says',
      corrected_agent_response: 'Jane is calling about a refund',
    },
  });
  h.recv(userTurn("No, I'm busy"));
  assert.deepEqual(h.transcripts, [
    { role: 'agent', text: 'Jane is calling about a refund' },
    { role: 'caller', text: "No, I'm busy" },
  ]);
});

test('the agent turn is reported before the tool call that follows it', () => {
  const h = events();
  const order: string[] = [];
  h.p.on('transcript', (role) => order.push(role));
  h.p.on('tool', (name) => order.push(name));
  h.recv({ type: 'agent_response', agent_response_event: { agent_response: 'One moment.' } });
  h.recv(toolCall('warm_transfer', { extension: '1001' }));
  assert.deepEqual(order, ['agent', 'warm_transfer']);
});

test('a bracketed word that is not a lowercase voice tag stays in the turn', () => {
  const h = events();
  h.recv({
    type: 'agent_response',
    agent_response_event: { agent_response: 'Say [Sales] or [Support]. [warm] Thanks.' },
  });
  h.recv(userTurn(''));
  assert.deepEqual(h.transcripts, [{ role: 'agent', text: 'Say [Sales] or [Support]. Thanks.' }]);
});
