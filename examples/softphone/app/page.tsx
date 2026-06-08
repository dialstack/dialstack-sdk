'use client';

import { useEffect, useRef, useState } from 'react';
import { DialStackPhone, type Call, type CallEndReason } from '@dialstack/sdk/webrtc';
import styles from './page.module.css';

type Status = 'idle' | 'connecting' | 'connected' | 'disconnected' | 'error';

type CallView = {
  id: string;
  direction: 'inbound' | 'outbound';
  state: string;
  from: string;
  to: string;
  isMuted: boolean;
  isHeld: boolean;
  // Set on a consult leg: the id of the original (held) call it was dialed
  // for during an attended transfer.
  parentId?: string;
};

const STATUS_LABEL: Record<Status, string> = {
  idle: 'Idle',
  connecting: 'Connecting…',
  connected: 'Connected',
  disconnected: 'Disconnected',
  error: 'Error',
};

export default function Page() {
  const phoneRef = useRef<DialStackPhone | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [message, setMessage] = useState<string>('');
  const [destination, setDestination] = useState<string>('');
  const [dtmf, setDtmf] = useState<string>('');
  const [transferDest, setTransferDest] = useState<string>('');
  const [calls, setCalls] = useState<Record<string, { view: CallView; call: Call }>>({});

  useEffect(() => {
    return () => {
      phoneRef.current?.disconnect();
    };
  }, []);

  const upsertCall = (call: Call, parentId?: string) => {
    setCalls((prev) => ({ ...prev, [call.id]: { view: snapshot(call, parentId), call } }));
  };

  const refreshCall = (call: Call) => {
    setCalls((prev) => {
      if (!prev[call.id]) return prev;
      return { ...prev, [call.id]: { call, view: snapshot(call, prev[call.id].view.parentId) } };
    });
  };

  const removeCall = (id: string) => {
    setCalls((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  const wireCall = (call: Call, parentId?: string) => {
    // Example limitation: a single shared <audio> element. Wiring a second
    // concurrent call here overwrites the first call's srcObject, so only
    // the most recent call has audible playback. A real softphone would
    // create an <audio> element per call (or mix with WebAudio).
    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = call.remoteMediaStream;
      void remoteAudioRef.current.play().catch(() => undefined);
    }
    call.on('trying', () => refreshCall(call));
    call.on('ringing', () => refreshCall(call));
    call.on('answered', () => refreshCall(call));
    call.on('held', () => refreshCall(call));
    call.on('resumed', () => refreshCall(call));
    call.on('ended', (reason: CallEndReason) => {
      setMessage(`Call ended (${reason})`);
      removeCall(call.id);
    });
    upsertCall(call, parentId);
  };

  const connect = async () => {
    setStatus('connecting');
    setMessage('Minting user session …');
    try {
      const resp = await fetch('/api/session', { method: 'POST' });
      if (!resp.ok) {
        const body = await resp.text();
        throw new Error(`session mint failed: ${body}`);
      }
      const { token, apiBaseUrl } = (await resp.json()) as { token: string; apiBaseUrl: string };

      const phone = new DialStackPhone({ token, apiBaseUrl });
      phone.on('connected', () => {
        setStatus('connected');
        setMessage('');
      });
      phone.on('disconnected', () => {
        setStatus('disconnected');
        setMessage('Disconnected');
      });
      phone.on('reconnecting', (attempt, delayMs) => {
        setMessage(`Reconnecting (attempt ${attempt}, in ${delayMs}ms) …`);
      });
      phone.on('reconnected', () => {
        setStatus('connected');
        setMessage('');
      });
      phone.on('incoming', (call) => {
        setMessage(`Incoming call from ${call.from}`);
        wireCall(call);
      });
      phone.on('error', (err) => {
        setMessage(`${err.code} — ${err.message}`);
      });

      phoneRef.current = phone;
      await phone.connect();
    } catch (e) {
      setStatus('error');
      setMessage((e as Error).message);
    }
  };

  const disconnect = () => {
    phoneRef.current?.disconnect();
    phoneRef.current = null;
    setStatus('disconnected');
    setMessage('Disconnected');
    setCalls({});
  };

  const placeCall = async () => {
    if (!phoneRef.current || !destination) return;
    try {
      setMessage(`Dialing ${destination} …`);
      const call = await phoneRef.current.call(destination);
      wireCall(call);
    } catch (e) {
      setMessage((e as Error).message);
    }
  };

  const blindTransfer = (call: Call) => {
    try {
      call.transfer(transferDest);
      setMessage(`Transferring to ${transferDest} …`);
      setTransferDest('');
    } catch (e) {
      setMessage((e as Error).message);
    }
  };

  const startAttendedTransfer = async (call: Call) => {
    try {
      setMessage(`Consulting ${transferDest} …`);
      const consult = await call.attendedTransfer(transferDest);
      setTransferDest('');
      wireCall(consult, call.id);
    } catch (e) {
      setMessage((e as Error).message);
    }
  };

  const completeTransfer = (call: Call) => {
    try {
      call.completeTransfer();
      setMessage('Completing transfer …');
    } catch (e) {
      setMessage((e as Error).message);
    }
  };

  const sendDtmf = (call: Call) => {
    try {
      call.sendDtmf(dtmf);
      setDtmf('');
    } catch (e) {
      setMessage((e as Error).message);
    }
  };

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <div className={styles.logo}>
          <Logo />
          <span className={styles.tagline}>Softphone example</span>
        </div>
        <span className={styles.statusPill}>
          <span className={`${styles.dot} ${statusDotClass(status, styles)}`} />
          {STATUS_LABEL[status]}
        </span>
      </header>

      <main className={styles.main}>
        <audio ref={remoteAudioRef} autoPlay playsInline />

        <div className={styles.message}>{message}</div>

        <section className={styles.panel}>
          <div className={styles.row}>
            {status !== 'connected' ? (
              <button
                onClick={connect}
                disabled={status === 'connecting'}
                className={`${styles.button} ${styles.buttonPrimary}`}
              >
                Connect
              </button>
            ) : (
              <button onClick={disconnect} className={styles.button}>
                Disconnect
              </button>
            )}
          </div>
        </section>

        <section className={styles.panel}>
          <h2 className={styles.panelTitle}>Place a call</h2>
          <div className={styles.row}>
            <input
              type="tel"
              placeholder="+14155551234 or extension"
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
              className={styles.input}
              autoComplete="off"
            />
            <button
              onClick={placeCall}
              disabled={status !== 'connected' || !destination}
              className={`${styles.button} ${styles.buttonPrimary}`}
            >
              Dial
            </button>
          </div>
        </section>

        <section className={styles.panel}>
          <h2 className={styles.panelTitle}>Active calls</h2>
          {Object.values(calls).length === 0 && <p className={styles.empty}>None.</p>}
          {Object.values(calls).map(({ view, call }) => {
            const peer = view.direction === 'inbound' ? view.from : view.to;
            // Consult leg of an attended transfer started from this call,
            // if one exists — gates the "Complete transfer" button.
            const consult = Object.values(calls).find((c) => c.view.parentId === view.id);
            return (
              <div key={view.id} className={styles.call}>
                <div className={styles.callHeader}>
                  <div className={styles.callPeer}>
                    <span className={styles.callPeerNumber}>{peer || '—'}</span>
                    <span className={styles.callPeerMeta}>
                      {view.direction} · {view.id}
                    </span>
                  </div>
                  <span className={styles.callState}>{view.state}</span>
                </div>

                <div className={styles.callActions}>
                  {view.direction === 'inbound' && view.state === 'ringing' && (
                    <>
                      <button
                        onClick={() => call.answer()}
                        className={`${styles.button} ${styles.buttonPrimary}`}
                      >
                        Answer
                      </button>
                      <button onClick={() => call.reject()} className={styles.button}>
                        Reject
                      </button>
                    </>
                  )}
                  {view.state === 'active' && (
                    <>
                      <button
                        onClick={() => {
                          call.hold();
                          refreshCall(call);
                        }}
                        className={styles.button}
                      >
                        Hold
                      </button>
                      <button
                        onClick={() => {
                          view.isMuted ? call.unmute() : call.mute();
                          refreshCall(call);
                        }}
                        className={styles.button}
                      >
                        {view.isMuted ? 'Unmute' : 'Mute'}
                      </button>
                    </>
                  )}
                  {view.state === 'held' && (
                    <button
                      onClick={() => {
                        call.resume();
                        refreshCall(call);
                      }}
                      className={styles.button}
                    >
                      Resume
                    </button>
                  )}
                  {view.state === 'held' && consult?.view.state === 'active' && (
                    <button
                      onClick={() => completeTransfer(call)}
                      className={`${styles.button} ${styles.buttonPrimary}`}
                    >
                      Complete transfer
                    </button>
                  )}
                  {!(view.direction === 'inbound' && view.state === 'ringing') && (
                    <button onClick={() => call.hangup()} className={`${styles.button} ${styles.buttonDanger}`}>
                      Hang up
                    </button>
                  )}
                </div>

                {view.state === 'active' && (
                  <div className={styles.dtmfRow}>
                    <input
                      value={transferDest}
                      onChange={(e) => setTransferDest(e.target.value)}
                      placeholder="Transfer destination"
                      className={styles.input}
                    />
                    <button
                      onClick={() => blindTransfer(call)}
                      disabled={!transferDest}
                      className={styles.button}
                    >
                      Blind transfer
                    </button>
                    <button
                      onClick={() => void startAttendedTransfer(call)}
                      disabled={!transferDest}
                      className={styles.button}
                    >
                      Consult
                    </button>
                  </div>
                )}

                {view.state === 'active' && (
                  <div className={styles.dtmfRow}>
                    <input
                      value={dtmf}
                      onChange={(e) => setDtmf(e.target.value)}
                      placeholder="DTMF digits"
                      className={styles.input}
                    />
                    <button onClick={() => sendDtmf(call)} disabled={!dtmf} className={styles.button}>
                      Send
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </section>
      </main>
    </div>
  );
}

function snapshot(call: Call, parentId?: string): CallView {
  return {
    id: call.id,
    direction: call.direction,
    state: call.state,
    from: call.from,
    to: call.to,
    isMuted: call.isMuted,
    isHeld: call.isHeld,
    parentId,
  };
}

function statusDotClass(status: Status, css: Record<string, string>): string {
  switch (status) {
    case 'connected':
      return css.dotConnected ?? '';
    case 'connecting':
      return css.dotConnecting ?? '';
    case 'error':
      return css.dotError ?? '';
    default:
      return '';
  }
}

function Logo() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 40" fill="none" aria-label="DialStack">
      <g fill="currentColor">
        <rect x="2" y="14" width="3" height="12" rx="1.5" />
        <rect x="8" y="10" width="3" height="20" rx="1.5" />
        <rect x="14" y="4" width="3" height="32" rx="1.5" />
        <rect x="20" y="8" width="3" height="24" rx="1.5" />
        <rect x="26" y="12" width="3" height="16" rx="1.5" />
      </g>
      <text
        x="36"
        y="27"
        fontFamily="Inter, system-ui, -apple-system, sans-serif"
        fontSize="16"
        fontWeight={600}
        fill="currentColor"
      >
        DialStack
      </text>
    </svg>
  );
}
