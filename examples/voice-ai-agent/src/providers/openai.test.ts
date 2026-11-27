import assert from 'node:assert/strict';
import { test } from 'node:test';

import WebSocket from 'ws';

import { OpenAIProvider, TRANSFER_TOOL_DEFINITION, type OpenAIOptions } from './openai.js';

// Drives the provider's message handling without a network: frames go in as
// OpenAI would send them, and what the provider sends back is captured.
function harness(extra: Partial<OpenAIOptions> = {}) {
  const p = new OpenAIProvider({
    apiKey: 'k',
    model: 'm',
    voice: 'v',
    instructions: 'i',
    ...extra,
  });
  // `sent` drops the event_id we tag response.create with; `raw` keeps it.
  const sent: unknown[] = [];
  const raw: Record<string, unknown>[] = [];
  const internals = p as unknown as {
    ws: unknown;
    handleMessage(text: string): void;
    sessionUpdate(): { session: Record<string, unknown> };
  };
  internals.ws = {
    readyState: WebSocket.OPEN,
    send: (s: string) => {
      const m = JSON.parse(s) as Record<string, unknown>;
      raw.push(m);
      const { event_id: _id, ...rest } = m;
      sent.push(m.type === 'response.create' ? rest : m);
    },
  };
  const transcripts: { role: string; text: string }[] = [];
  p.on('transcript', (role, text) => transcripts.push({ role, text }));
  return {
    p,
    sent,
    raw,
    lastCreateId: () => raw.filter((m) => m.type === 'response.create').at(-1)?.event_id,
    transcripts,
    internals,
    recv: (msg: object | object[]) =>
      (Array.isArray(msg) ? msg : [msg]).forEach((m) => internals.handleMessage(JSON.stringify(m))),
  };
}

// A function call runs only from the response that completed it.
const functionCall = (name: string, args: object | string, status = 'completed') => [
  { type: 'response.created', response: { id: 'rf' } },
  {
    type: 'response.done',
    response: {
      id: 'rf',
      status,
      output: [
        {
          type: 'function_call',
          call_id: 'c1',
          name,
          arguments: typeof args === 'string' ? args : JSON.stringify(args),
        },
      ],
    },
  },
];

test('sendText sends a user text turn and asks the model to answer it', () => {
  const h = harness({ greet: false });
  h.recv({ type: 'session.updated' });
  h.p.sendText('Brief the person who answered.');
  assert.deepEqual(h.sent, [
    {
      type: 'conversation.item.create',
      item: {
        type: 'message',
        role: 'user',
        content: [{ type: 'input_text', text: 'Brief the person who answered.' }],
      },
    },
    { type: 'response.create' },
  ]);
});

test('sendText before the session is ready sends nothing', () => {
  const h = harness();
  h.p.sendText('too early');
  assert.deepEqual(h.sent, []);
});

test('the session declares the tools it was given', () => {
  const h = harness({ tools: [TRANSFER_TOOL_DEFINITION] });
  assert.deepEqual(h.internals.sessionUpdate().session.tools, [TRANSFER_TOOL_DEFINITION]);
});

test('the caller is transcribed only when asked, since it is billed per minute', () => {
  const input = (o: Partial<OpenAIOptions>) =>
    (harness(o).internals.sessionUpdate().session.audio as { input: { transcription?: unknown } })
      .input;
  assert.equal(input({}).transcription, undefined);
  assert.ok(input({ transcribe: true }).transcription);
});

test('the model greets first by default', () => {
  const h = harness();
  h.recv({ type: 'session.updated' });
  assert.deepEqual(h.sent, [{ type: 'response.create' }]);
});

test('a session told not to greet waits for a turn', () => {
  const h = harness({ greet: false });
  h.recv({ type: 'session.updated' });
  assert.deepEqual(h.sent, []);
});

test('a function call goes to the application, and its reply back to the model, which answers it', () => {
  const h = harness();
  h.recv({ type: 'session.updated' });
  h.sent.length = 0;
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  h.p.on('tool', (name, args, reply) => {
    calls.push({ name, args });
    reply({ result: 'Transfer started.' });
  });
  h.recv(functionCall('warm_transfer', { extension: '1002' }));
  assert.deepEqual(calls, [{ name: 'warm_transfer', args: { extension: '1002' } }]);
  assert.deepEqual(h.sent, [
    {
      type: 'conversation.item.create',
      item: {
        type: 'function_call_output',
        call_id: 'c1',
        output: JSON.stringify({ result: 'Transfer started.' }),
      },
    },
    { type: 'response.create' },
  ]);
});

test('transfer_to_human emits transfer, and the outcome is told to the model', () => {
  const h = harness();
  const targets: Record<string, unknown>[] = [];
  h.p.on('transfer', (args, done) => {
    targets.push(args);
    done(new Error('busy'));
  });
  h.recv(functionCall('transfer_to_human', { extension: '1008' }));
  assert.deepEqual(targets, [{ extension: '1008' }]);
  const out = h.sent[0] as { item: { output: string } };
  assert.ok('error' in JSON.parse(out.item.output));
  assert.deepEqual(h.sent[1], { type: 'response.create' });
});

test('an unknown function with no application listening is refused', () => {
  const h = harness();
  h.recv(functionCall('warm_transfer', {}));
  const out = h.sent[0] as { item: { output: string } };
  assert.deepEqual(JSON.parse(out.item.output), { error: 'This tool is not available.' });
});

test('the caller turn and the assembled agent turn are reported as transcripts', () => {
  const h = harness();
  h.recv({
    type: 'conversation.item.input_audio_transcription.completed',
    transcript: 'I need billing',
  });
  h.recv({ type: 'response.created', response: { id: 'r1' } });
  h.recv({ type: 'response.output_audio_transcript.delta', response_id: 'r1', delta: 'Sure, ' });
  h.recv({
    type: 'response.output_audio_transcript.delta',
    response_id: 'r1',
    delta: 'one moment.',
  });
  h.recv({ type: 'response.done', response: { id: 'r1', status: 'completed' } });
  assert.deepEqual(h.transcripts, [
    { role: 'caller', text: 'I need billing' },
    { role: 'agent', text: 'Sure, one moment.' },
  ]);
});

test('a late delta from an interrupted response does not leak into the next turn', () => {
  const h = harness();
  h.recv({ type: 'response.created', response: { id: 'r1' } });
  h.recv({ type: 'response.output_audio_transcript.delta', response_id: 'r1', delta: 'Our hours' });
  h.recv({ type: 'response.created', response: { id: 'r2' } });
  h.recv({ type: 'response.output_audio_transcript.delta', response_id: 'r1', delta: ' are nine' });
  h.recv({ type: 'response.output_audio_transcript.delta', response_id: 'r2', delta: 'Go ahead.' });
  h.recv({ type: 'response.done', response: { id: 'r1', status: 'cancelled' } });
  h.recv({ type: 'response.done', response: { id: 'r2', status: 'completed' } });
  assert.deepEqual(h.transcripts, [{ role: 'agent', text: 'Go ahead.' }]);
});

test('a function call in an interrupted or cancelled response is not run, and the model is told', () => {
  for (const status of ['cancelled', 'incomplete']) {
    const h = harness({ greet: false });
    h.recv({ type: 'session.updated' });
    const calls: string[] = [];
    h.p.on('tool', (name) => calls.push(name));
    h.recv(functionCall('accept', {}, status));
    assert.deepEqual(calls, [], status);
    const out = h.sent as {
      type: string;
      item?: { type: string; call_id: string; output: string };
    }[];
    assert.equal(out.length, 1, status);
    assert.equal(out[0].item?.type, 'function_call_output');
    assert.equal(out[0].item?.call_id, 'c1');
    assert.ok('error' in JSON.parse(out[0].item!.output));
  }
});

test('a function call with arguments that are not valid JSON is refused, not run with none', () => {
  const h = harness();
  const targets: unknown[] = [];
  h.p.on('transfer', (args) => targets.push(args));
  h.recv(functionCall('transfer_to_human', '{"extension": "10'));
  assert.deepEqual(targets, []);
  const out = h.sent[0] as { item: { output: string } };
  assert.ok('error' in JSON.parse(out.item.output));
});

test('a turn added while a response is in progress asks for the next one only once it ends', () => {
  const h = harness({ greet: false });
  h.recv({ type: 'session.updated' });
  h.recv({ type: 'response.created', response: { id: 'r1' } });
  h.p.sendText('The colleague declined.');
  assert.deepEqual(
    h.sent.map((m) => (m as { type: string }).type),
    ['conversation.item.create']
  );
  h.recv({ type: 'response.done', response: { id: 'r1', status: 'completed' } });
  assert.deepEqual(h.sent.at(-1), { type: 'response.create' });
});

test('a turn added before the requested response has started waits for it to end', () => {
  const h = harness();
  h.recv({ type: 'session.updated' }); // greeting requested, not yet created
  h.p.sendText('The colleague declined.');
  const creates = () =>
    h.sent.filter((m) => (m as { type: string }).type === 'response.create').length;
  assert.equal(creates(), 1);
  h.recv({ type: 'response.created', response: { id: 'r1' } });
  h.recv({ type: 'response.done', response: { id: 'r1', status: 'completed' } });
  assert.equal(creates(), 2);
});

test('a rejected response request does not block the next one', () => {
  const h = harness();
  h.recv({ type: 'session.updated' });
  h.recv({
    type: 'error',
    error: { type: 'invalid_request_error', code: 'invalid_value', event_id: h.lastCreateId() },
  });
  h.p.sendText('hello');
  assert.deepEqual(h.sent.at(-1), { type: 'response.create' });
});

test('a request refused because a response is already active is answered once that one ends', () => {
  const h = harness({ greet: false });
  h.recv({ type: 'session.updated' });
  h.p.sendText('The colleague declined.');
  const creates = () => h.raw.filter((m) => m.type === 'response.create').length;
  h.recv({
    type: 'error',
    error: {
      type: 'invalid_request_error',
      code: 'conversation_already_has_active_response',
      event_id: h.lastCreateId(),
    },
  });
  h.recv({ type: 'response.created', response: { id: 'vad' } });
  assert.equal(creates(), 1);
  h.recv({ type: 'response.done', response: { id: 'vad', status: 'completed' } });
  assert.equal(creates(), 2);
});

test('an error about something else does not free the requested response', () => {
  const h = harness();
  h.recv({ type: 'session.updated' }); // greeting requested
  h.recv({
    type: 'error',
    error: { type: 'invalid_request_error', code: 'invalid_value', event_id: 'other' },
  });
  h.p.sendText('hello');
  assert.equal(h.raw.filter((m) => m.type === 'response.create').length, 1);
});

test('a function call whose arguments are not a JSON object is refused, not run with none', () => {
  for (const args of ['null', '[]', '"1002"', '', '   ']) {
    const h = harness();
    const ran: unknown[] = [];
    h.p.on('transfer', (a) => ran.push(a));
    h.p.on('tool', (name) => ran.push(name));
    h.recv(functionCall('transfer_to_human', args));
    h.recv(functionCall('accept', args));
    assert.deepEqual(ran, [], `arguments ${JSON.stringify(args)}`);
  }
});

test('a tool result is sent before the next response, and one response answers both it and a queued turn', () => {
  const h = harness({ greet: false });
  h.recv({ type: 'session.updated' });
  h.p.on('tool', (_name, _args, reply) => reply({ ok: true }));
  h.recv({ type: 'response.created', response: { id: 'rf' } });
  h.p.sendText('The colleague declined.');
  h.recv({
    type: 'response.done',
    response: {
      id: 'rf',
      status: 'completed',
      output: [{ type: 'function_call', call_id: 'c1', name: 'accept', arguments: '{}' }],
    },
  });
  const types = h.sent.map((m) => {
    const x = m as { type: string; item?: { type: string } };
    return x.item ? x.item.type : x.type;
  });
  assert.deepEqual(types, ['message', 'function_call_output', 'response.create']);
  h.recv({ type: 'response.created', response: { id: 'r2' } });
  h.recv({ type: 'response.done', response: { id: 'r2', status: 'completed' } });
  assert.equal(h.sent.filter((m) => (m as { type: string }).type === 'response.create').length, 1);
});

test('a refusal that arrives after the other response has started is still answered later', () => {
  const h = harness({ greet: false });
  h.recv({ type: 'session.updated' });
  h.p.sendText('The colleague declined.');
  const id = h.lastCreateId();
  h.recv({ type: 'response.created', response: { id: 'vad' } });
  h.recv({
    type: 'error',
    error: {
      type: 'invalid_request_error',
      code: 'conversation_already_has_active_response',
      event_id: id,
    },
  });
  h.recv({ type: 'response.done', response: { id: 'vad', status: 'completed' } });
  assert.equal(h.raw.filter((m) => m.type === 'response.create').length, 2);
});

const ulawB64 = (bytes: number) => Buffer.alloc(bytes, 0xff).toString('base64');

test('audio deltas carry the item and its cumulative ms', () => {
  const h = harness();
  const got: unknown[] = [];
  h.p.on('audio', (ulaw, meta) => got.push({ bytes: ulaw.length, meta }));
  h.recv({ type: 'response.created', response: { id: 'r1' } });
  h.recv({
    type: 'response.output_audio.delta',
    response_id: 'r1',
    item_id: 'i1',
    delta: ulawB64(800),
  });
  h.recv({
    type: 'response.output_audio.delta',
    response_id: 'r1',
    item_id: 'i1',
    delta: ulawB64(1600),
  });
  h.recv({ type: 'response.output_audio.done', response_id: 'r1', item_id: 'i1' });
  assert.deepEqual(got, [
    { bytes: 800, meta: { itemId: 'i1', endMs: 100 } },
    { bytes: 1600, meta: { itemId: 'i1', endMs: 300 } },
    { bytes: 0, meta: { itemId: 'i1', endMs: 300, last: true } },
  ]);
});

// The model must forget what the caller never heard, or it carries on as if
// they had heard all of it.
test('barge-in truncates the item to what was played before interrupting', () => {
  const h = harness();
  h.recv({ type: 'response.created', response: { id: 'r1' } });
  h.recv({
    type: 'response.output_audio.delta',
    response_id: 'r1',
    item_id: 'i1',
    delta: ulawB64(8000),
  });
  h.p.audioPlayed('i1', 400);
  h.p.audioPlayed('i1', 200); // a late, smaller echo never moves it back
  let sentAtInterrupt = -1;
  h.p.on('interrupt', () => (sentAtInterrupt = h.sent.length));
  h.recv({ type: 'input_audio_buffer.speech_started' });

  const truncate = {
    type: 'conversation.item.truncate',
    item_id: 'i1',
    content_index: 0,
    audio_end_ms: 400,
  };
  assert.deepEqual(h.sent.at(-1), truncate);
  assert.equal(sentAtInterrupt, h.sent.length, 'truncate goes out before interrupt');
});

test('barge-in after the item was fully played sends no truncate', () => {
  const h = harness();
  h.recv({ type: 'response.created', response: { id: 'r1' } });
  h.recv({
    type: 'response.output_audio.delta',
    response_id: 'r1',
    item_id: 'i1',
    delta: ulawB64(800),
  });
  h.recv({ type: 'response.output_audio.done', response_id: 'r1', item_id: 'i1' });
  h.p.audioPlayed('i1', 100);
  h.recv({ type: 'input_audio_buffer.speech_started' });
  assert.equal(
    h.sent.filter((m) => (m as { type: string }).type === 'conversation.item.truncate').length,
    0
  );
});

// A finished item can still be playing when the next one starts generating;
// barge-in must cut both to what the caller heard.
test('barge-in truncates every item not fully played', () => {
  const h = harness();
  h.recv({ type: 'response.created', response: { id: 'r1' } });
  h.recv({
    type: 'response.output_audio.delta',
    response_id: 'r1',
    item_id: 'i1',
    delta: ulawB64(1600),
  });
  h.recv({ type: 'response.output_audio.done', response_id: 'r1', item_id: 'i1' });
  h.recv({ type: 'response.created', response: { id: 'r2' } });
  h.recv({
    type: 'response.output_audio.delta',
    response_id: 'r2',
    item_id: 'i2',
    delta: ulawB64(1600),
  });
  h.p.audioPlayed('i1', 100);
  h.recv({ type: 'input_audio_buffer.speech_started' });

  const truncates = h.sent.filter(
    (m) => (m as { type: string }).type === 'conversation.item.truncate'
  );
  assert.deepEqual(truncates, [
    { type: 'conversation.item.truncate', item_id: 'i1', content_index: 0, audio_end_ms: 100 },
    { type: 'conversation.item.truncate', item_id: 'i2', content_index: 0, audio_end_ms: 0 },
  ]);
});

// Audio of the interrupted response that arrives after barge-in is never
// played, so its item is cut to nothing, once.
test('an item first seen after barge-in is truncated to zero', () => {
  const h = harness();
  h.recv({ type: 'response.created', response: { id: 'r1' } });
  h.recv({ type: 'input_audio_buffer.speech_started' });
  let audio = 0;
  h.p.on('audio', () => audio++);
  h.recv({
    type: 'response.output_audio.delta',
    response_id: 'r1',
    item_id: 'i9',
    delta: ulawB64(800),
  });
  h.recv({
    type: 'response.output_audio.delta',
    response_id: 'r1',
    item_id: 'i9',
    delta: ulawB64(800),
  });

  assert.equal(audio, 0);
  const truncates = h.sent.filter(
    (m) => (m as { type: string }).type === 'conversation.item.truncate'
  );
  assert.deepEqual(truncates, [
    { type: 'conversation.item.truncate', item_id: 'i9', content_index: 0, audio_end_ms: 0 },
  ]);
});

function truncates(h: { sent: unknown[] }) {
  return h.sent.filter((m) => (m as { type: string }).type === 'conversation.item.truncate');
}

// OpenAI keeps what it generated before the cancel, so an item still
// generating is cut even when all of it delivered so far was heard.
test('barge-in truncates an item still generating, even if all of it so far was heard', () => {
  const h = harness();
  h.recv({ type: 'response.created', response: { id: 'r1' } });
  h.recv({ type: 'response.output_audio.delta', response_id: 'r1', item_id: 'i1', delta: ulawB64(800) });
  h.p.audioPlayed('i1', 100);
  h.recv({ type: 'input_audio_buffer.speech_started' });
  assert.deepEqual(truncates(h), [
    { type: 'conversation.item.truncate', item_id: 'i1', content_index: 0, audio_end_ms: 100 },
  ]);
});

test('an item the session stopped forwarding is truncated once played to that point', () => {
  const h = harness();
  h.recv({ type: 'response.created', response: { id: 'r1' } });
  h.recv({ type: 'response.output_audio.delta', response_id: 'r1', item_id: 'i1', delta: ulawB64(8000) });
  h.p.audioDropped('i1', 400);
  assert.equal(truncates(h).length, 0, 'not before the caller has heard it');
  h.p.audioPlayed('i1', 400);
  assert.deepEqual(truncates(h), [
    { type: 'conversation.item.truncate', item_id: 'i1', content_index: 0, audio_end_ms: 400 },
  ]);
  h.recv({ type: 'input_audio_buffer.speech_started' });
  assert.equal(truncates(h).length, 1, 'not cut again on a later barge-in');
});

test('late audio of a truncated item is not tracked again', () => {
  const h = harness();
  h.recv({ type: 'response.created', response: { id: 'r1' } });
  h.recv({ type: 'response.output_audio.delta', response_id: 'r1', item_id: 'i1', delta: ulawB64(8000) });
  h.p.audioDropped('i1', 400);
  h.p.audioPlayed('i1', 400);
  h.recv({ type: 'response.output_audio.delta', response_id: 'r1', item_id: 'i1', delta: ulawB64(800) });
  h.recv({ type: 'input_audio_buffer.speech_started' });
  assert.deepEqual(truncates(h), [
    { type: 'conversation.item.truncate', item_id: 'i1', content_index: 0, audio_end_ms: 400 },
  ]);
});
