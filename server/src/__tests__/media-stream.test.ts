import { EventEmitter } from 'events';
import { MediaStream, type MediaStreamDtmfEvent, type WebSocketLike } from '../index.js';

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
});
