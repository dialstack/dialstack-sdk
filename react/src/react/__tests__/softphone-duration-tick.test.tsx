/**
 * The in-call clock ticks twice a second. Only what shows it may re-render on
 * that tick: a host component reading other softphone state (a patient card
 * keyed off `calls`, say) re-rendering with it drags its whole subtree along.
 */

import React from 'react';
import { render, act } from '@testing-library/react';
import { SoftphoneProvider, useSoftphone } from '../softphone/provider/SoftphoneProvider';
import { useCallDuration } from '../softphone/hooks';

// ---- fake core (mirrors SoftphoneAccessors.test.tsx) -----------------------

type Handler = (...args: unknown[]) => void;

class Emitter {
  private listeners: Record<string, Set<Handler>> = {};
  on(event: string, h: Handler): void {
    (this.listeners[event] ??= new Set()).add(h);
  }
  off(event: string, h?: Handler): void {
    if (!h) delete this.listeners[event];
    else this.listeners[event]?.delete(h);
  }
  emit(event: string, ...args: unknown[]): void {
    this.listeners[event]?.forEach((h) => h(...args));
  }
}

class FakeCall extends Emitter {
  state = 'trying';
  duration = 0;
  get isConnected(): boolean {
    return this.state === 'active' || this.state === 'held';
  }
  canSendDtmf = true;
  remoteMediaStream = {} as MediaStream;
  answer = jest.fn();
  reject = jest.fn();
  hangup = jest.fn();
  mute = jest.fn();
  unmute = jest.fn();
  hold = jest.fn();
  resume = jest.fn();
  sendDtmf = jest.fn();
  transfer = jest.fn();
  completeTransfer = jest.fn();
  consult: FakeCall | null = null;
  attendedTransfer = jest.fn();
  constructor(
    public direction: 'inbound' | 'outbound',
    public from: string,
    public fromName: string | null,
    public to: string
  ) {
    super();
  }
}

class FakePhone extends Emitter {
  static last: FakePhone | null = null;
  constructor() {
    super();
    FakePhone.last = this;
  }
  connect(): Promise<void> {
    return Promise.resolve();
  }
  disconnect(): void {}
  listDirectory = jest.fn(() => Promise.resolve([]));
  subscribePresence = jest.fn();
  call(to: string): Promise<unknown> {
    return Promise.resolve(new FakeCall('outbound', '', null, to));
  }
}

jest.mock('@dialstack/sdk-webrtc', () => ({
  ...jest.requireActual('@dialstack/sdk-webrtc'),
  DialStackPhone: jest.fn().mockImplementation(() => new FakePhone()),
}));

function phone(): FakePhone {
  if (!FakePhone.last) throw new Error('phone not constructed');
  return FakePhone.last;
}

beforeAll(() => {
  Object.defineProperty(HTMLMediaElement.prototype, 'play', {
    configurable: true,
    value: jest.fn().mockResolvedValue(undefined),
  });
});

beforeEach(() => {
  FakePhone.last = null;
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('the in-call clock tick', () => {
  it('re-renders the clock, and for now every other useSoftphone() consumer', () => {
    const renders = { callsOnly: 0, clock: 0 };

    const CallsOnly = (): React.JSX.Element => {
      renders.callsOnly++;
      const { calls } = useSoftphone();
      return <span>{calls.length}</span>;
    };
    const Clock = (): React.JSX.Element => {
      renders.clock++;
      const { activeCall } = useSoftphone();
      return <span>{useCallDuration(activeCall)}</span>;
    };

    render(
      <SoftphoneProvider token="tok">
        <CallsOnly />
        <Clock />
      </SoftphoneProvider>
    );
    act(() => phone().emit('connected'));
    const inbound = new FakeCall('inbound', '+14155552671', 'Alice', 'me');
    act(() => phone().emit('incoming', inbound));
    act(() => {
      inbound.state = 'active';
      inbound.emit('answered');
    });

    const before = { ...renders };
    // One act per tick: a single act would batch every tick into one render.
    for (let i = 0; i < 6; i++) {
      act(() => {
        jest.advanceTimersByTime(500);
      });
    }

    expect(renders.clock - before.clock).toBeGreaterThanOrEqual(5);
    // NEXT MAJOR: the deprecated `useSoftphone().duration` ticks every consumer,
    // so this one re-renders even though it never reads the clock. Removing the
    // field (see SoftphoneProviderBase) makes this fail: change it to
    // `.toBe(0)` and rename the test.
    expect(renders.callsOnly - before.callsOnly).toBeGreaterThanOrEqual(5);
  });
});
