/**
 * Tests for parsing real-time call events off the SSE stream
 */

describe('DialStackInstanceImplClass call events', () => {
  // on() lazily opens the stream; leave that connect pending so it neither
  // errors nor schedules reconnects while events are fed in by hand.
  global.fetch = jest.fn(() => new Promise<Response>(() => {}));

  const newInstance = async () => {
    const { DialStackInstanceImplClass } = await import('../core/instance');
    return new DialStackInstanceImplClass({
      publishableKey: 'pk_test_xxx',
      fetchClientSecret: async () => 'cs_test_secret',
    });
  };

  // parseAndEmitEvent is the stream reader's per-event step; calling it directly
  // keeps the test off the fetch/ReadableStream plumbing.
  const feed = (instance: unknown, eventText: string) =>
    (instance as { parseAndEmitEvent(text: string): void }).parseAndEmitEvent(eventText);

  it('emits call.ringing with the user being rung', async () => {
    const instance = await newInstance();
    const handler = jest.fn();
    instance.on('call.ringing', handler);

    feed(
      instance,
      'event: call.ringing\ndata: ' +
        JSON.stringify({
          event: 'call.ringing',
          account: 'acct_01h00000000000000000000000',
          call_id: 'call_01h00000000000000000000000',
          user: 'user_01h00000000000000000000000',
          direction: 'inbound',
          from_number: '+14155551234',
          from_name: null,
          to_number: '+14155559876',
          ringing_at: '2026-10-23T12:00:00Z',
          timestamp: '2026-10-23T12:00:00Z',
        })
    );

    expect(handler).toHaveBeenCalledWith({
      call_id: 'call_01h00000000000000000000000',
      user: 'user_01h00000000000000000000000',
      direction: 'inbound',
      from_number: '+14155551234',
      from_name: null,
      to_number: '+14155559876',
      ringing_at: new Date('2026-10-23T12:00:00Z'),
      timestamp: new Date('2026-10-23T12:00:00Z'),
    });
    instance.off('call.ringing', handler);
  });

  it('does not deliver call.ringing to call.incoming handlers', async () => {
    const instance = await newInstance();
    const handler = jest.fn();
    instance.on('call.incoming', handler);

    feed(
      instance,
      'event: call.ringing\ndata: {"user":"user_x","timestamp":"2026-10-23T12:00:00Z"}'
    );

    expect(handler).not.toHaveBeenCalled();
    instance.off('call.incoming', handler);
  });
});
