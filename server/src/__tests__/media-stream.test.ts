import { EventEmitter } from 'events';
import {
  MediaStream,
  type MediaStreamEvents,
  type MediaStreamDtmfEvent,
  type MediaStreamMarkEvent,
  type MediaStreamOverflowEvent,
  type WebSocketLike,
} from '../index.js';

class FakeWebSocket extends EventEmitter {
  readyState = 1;
  send = jest.fn();
  close = jest.fn();
}

describe('MediaStream', () => {
  it('emits dtmf for a keypad press', () => {
    const ws = new FakeWebSocket();
    const stream = new MediaStream(ws as unknown as WebSocketLike);
    const onDtmf = jest.fn();
    stream.on('dtmf', onDtmf);

    const press: MediaStreamDtmfEvent = { event: 'dtmf', timestamp: 5320, digit: '#' };
    ws.emit('message', Buffer.from(JSON.stringify(press)));

    expect(onDtmf).toHaveBeenCalledWith(press);
  });

  it('ignores an unknown event', () => {
    const ws = new FakeWebSocket();
    const stream = new MediaStream(ws as unknown as WebSocketLike);
    const onError = jest.fn();
    stream.on('error', onError);

    ws.emit('message', JSON.stringify({ event: 'something_new' }));

    expect(onError).not.toHaveBeenCalled();
  });

  function sent(ws: FakeWebSocket): unknown[] {
    return ws.send.mock.calls.map(([data]) => JSON.parse(data as string));
  }

  it('exposes the protocol version from begin', () => {
    const ws = new FakeWebSocket();
    const stream = new MediaStream(ws as unknown as WebSocketLike);
    expect(stream.protocolVersion).toBeNull();

    ws.emit(
      'message',
      JSON.stringify({
        event: 'begin',
        call_id: 'call_1',
        account_id: 'acct_1',
        audio_format: { encoding: 'audio/x-mulaw', sample_rate: 8000, channels: 1 },
        protocol_version: '2.2',
      })
    );

    expect(stream.protocolVersion).toBe('2.2');
  });

  it('sends audio', () => {
    const ws = new FakeWebSocket();
    const stream = new MediaStream(ws as unknown as WebSocketLike);

    stream.sendAudio('AAAA');
    stream.sendAudioBuffer(Buffer.from([0xff, 0xff, 0xff]));

    expect(sent(ws)).toEqual([
      { event: 'audio', payload: 'AAAA' },
      { event: 'audio', payload: '////' },
    ]);
  });

  it('sends clear and mark', () => {
    const ws = new FakeWebSocket();
    const stream = new MediaStream(ws as unknown as WebSocketLike);

    stream.sendMark('greeting-done');
    stream.sendClear();

    expect(sent(ws)).toEqual([{ event: 'mark', name: 'greeting-done' }, { event: 'clear' }]);
  });

  it('rejects a mark name over 256 bytes', () => {
    const ws = new FakeWebSocket();
    const stream = new MediaStream(ws as unknown as WebSocketLike);

    expect(() => stream.sendMark('é'.repeat(129))).toThrow(RangeError);
    expect(() => stream.sendMark('n'.repeat(256))).not.toThrow();
    expect(ws.send).toHaveBeenCalledTimes(1);
  });

  it('emits mark echoes', () => {
    const ws = new FakeWebSocket();
    const stream = new MediaStream(ws as unknown as WebSocketLike);
    const onMark = jest.fn();
    stream.on('mark', onMark);

    const echo: MediaStreamMarkEvent = { event: 'mark', name: 'greeting-done', timestamp: 5320 };
    ws.emit('message', JSON.stringify(echo));

    expect(onMark).toHaveBeenCalledWith(echo);
  });

  it('emits overflow notices', () => {
    const ws = new FakeWebSocket();
    const stream = new MediaStream(ws as unknown as WebSocketLike);
    const onOverflow = jest.fn();
    stream.on('overflow', onOverflow);

    const notice: MediaStreamOverflowEvent = { event: 'overflow', timestamp: 20100 };
    ws.emit('message', JSON.stringify(notice));

    expect(onOverflow).toHaveBeenCalledWith(notice);
  });

  // Code written against the event map before mark existed must still compile.
  it('keeps MediaStreamEvents usable by generic wrappers', () => {
    const ws = new FakeWebSocket();
    const stream = new MediaStream(ws as unknown as WebSocketLike);
    const subscribe = <K extends keyof MediaStreamEvents>(k: K, l: MediaStreamEvents[K]) =>
      stream.on(k, l);
    const names: Record<keyof MediaStreamEvents, string> = {
      begin: 'b',
      audio: 'a',
      dtmf: 'd',
      close: 'c',
      error: 'e',
    };
    subscribe('dtmf', () => undefined);
    expect(Object.keys(names)).toHaveLength(5);
  });
});
