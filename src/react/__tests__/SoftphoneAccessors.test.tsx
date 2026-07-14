/**
 * Coverage for the build-your-own convenience accessors — `useIncomingCall` and
 * `useActiveCall`. These are public API (exported from `react.ts`) but consumed
 * by nobody inside the SDK, so a break in them is invisible to every other test
 * (this is exactly how a regression where `useIncomingCall` read `activeCall` —
 * which is never a ringing inbound in the multi-call model — shipped unnoticed).
 *
 * The test renders a minimal "build your own" UI through the accessors under a
 * real `<SoftphoneProvider>`, so the accessors are dogfooded the way a host
 * composing their own softphone would use them.
 */

import React from 'react';
import { render, screen, act } from '@testing-library/react';
import { SoftphoneProvider } from '../SoftphoneProvider';
import { useIncomingCall, useActiveCall } from '../SoftphoneProvider';

// ---- fake core (mirrors Softphone.test.tsx) --------------------------------

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
  nextCall: FakeCall | null = null;
  constructor() {
    super();
    FakePhone.last = this;
  }
  connect(): Promise<void> {
    return Promise.resolve();
  }
  disconnect(): void {}
  call(to: string): Promise<unknown> {
    const c = this.nextCall ?? new FakeCall('outbound', '', null, to);
    return Promise.resolve(c);
  }
}

jest.mock('../../webrtc', () => ({
  DialStackPhone: jest.fn().mockImplementation(() => new FakePhone()),
}));

function phone(): FakePhone {
  if (!FakePhone.last) throw new Error('phone not constructed');
  return FakePhone.last;
}

// HTMLMediaElement.play is not implemented in jsdom; the provider binds remote
// audio when a call goes active.
beforeAll(() => {
  Object.defineProperty(HTMLMediaElement.prototype, 'play', {
    configurable: true,
    value: jest.fn().mockResolvedValue(undefined),
  });
});

beforeEach(() => {
  FakePhone.last = null;
});

// A tiny build-your-own UI that renders ONLY through the convenience accessors —
// the shape a host would use for a bespoke softphone. If either accessor stops
// returning the right call, this UI stops rendering it and the tests fail.
function BuildYourOwn(): React.JSX.Element {
  const incoming = useIncomingCall();
  const { activeCall } = useActiveCall();
  return (
    <div>
      {incoming && <div data-testid="incoming">ringing: {incoming.from}</div>}
      {activeCall && <div data-testid="active">active: {activeCall.to}</div>}
      {!incoming && !activeCall && <div data-testid="idle">idle</div>}
    </div>
  );
}

function renderByo() {
  return render(
    <SoftphoneProvider token="tok">
      <BuildYourOwn />
    </SoftphoneProvider>
  );
}

describe('useIncomingCall / useActiveCall accessors', () => {
  it('reports idle when there is no call', () => {
    renderByo();
    act(() => phone().emit('connected'));
    expect(screen.getByTestId('idle')).toBeInTheDocument();
  });

  it('surfaces a ringing inbound through useIncomingCall (not useActiveCall)', () => {
    renderByo();
    act(() => phone().emit('connected'));

    const inbound = new FakeCall('inbound', '+14155552671', 'Alice', 'me');
    act(() => phone().emit('incoming', inbound));

    // The ringing inbound MUST come through useIncomingCall — the regression was
    // useIncomingCall reading activeCall, which is null while a call is ringing.
    expect(screen.getByTestId('incoming')).toHaveTextContent('+14155552671');
    // And it is NOT the active call while still alerting.
    expect(screen.queryByTestId('active')).not.toBeInTheDocument();
  });

  it('moves the call to useActiveCall once answered, clearing useIncomingCall', () => {
    renderByo();
    act(() => phone().emit('connected'));

    const inbound = new FakeCall('inbound', '+14155552671', 'Alice', 'me');
    act(() => phone().emit('incoming', inbound));
    act(() => {
      inbound.state = 'active';
      inbound.emit('answered');
    });

    expect(screen.queryByTestId('incoming')).not.toBeInTheDocument();
    expect(screen.getByTestId('active')).toHaveTextContent('me');
  });
});
