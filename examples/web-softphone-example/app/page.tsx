'use client';

import { useState } from 'react';
// The web softphone UI ships from `@dialstack/sdk/react` — it bundles the web
// components together with the shared headless "brain" (hooks + provider base).
// React Native apps use the separate `@dialstack/sdk-native` package instead.
import { SoftphoneProvider, Softphone } from '@dialstack/sdk/react';
import styles from './page.module.css';

type Session = { token: string; apiBaseUrl: string };
type Status = 'idle' | 'connecting' | 'connected' | 'error';

export default function Page() {
  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [message, setMessage] = useState<string>('');

  // Mint a short-lived WebRTC token from our own backend (/api/session), which
  // holds the sk_live_ key server-side. The browser only ever sees the minted
  // token — never the secret key. Once we have it, we mount <SoftphoneProvider>,
  // which owns the connection, the call UI, audio, and the E911 flow.
  const connect = async () => {
    setStatus('connecting');
    setMessage('Minting user session …');
    try {
      const resp = await fetch('/api/session', { method: 'POST' });
      if (!resp.ok) {
        throw new Error(`session mint failed: ${await resp.text()}`);
      }
      const body = (await resp.json()) as Session;
      setSession(body);
      setStatus('connected');
      setMessage('');
    } catch (e) {
      setStatus('error');
      setMessage((e as Error).message);
    }
  };

  const disconnect = () => {
    setSession(null);
    setStatus('idle');
    setMessage('');
  };

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <div className={styles.logo}>
          <Logo />
          <span className={styles.tagline}>Web softphone example</span>
        </div>
        <span className={styles.statusPill}>
          <span className={`${styles.dot} ${status === 'connected' ? styles.dotConnected : ''}`} />
          {status === 'connected' ? 'Connected' : status === 'connecting' ? 'Connecting…' : 'Idle'}
        </span>
      </header>

      <main className={styles.main}>
        {message && <div className={styles.message}>{message}</div>}

        {session ? (
          <div className={styles.phone}>
            {/* The shared component owns everything below the token: connection
                lifecycle, dial pad, incoming/ongoing call UI, audio, ringtone,
                mute/hold/transfer/DTMF, and the E911 flow. Contrast this with the
                basic example, which wires the headless @dialstack/sdk/webrtc core
                by hand. */}
            <SoftphoneProvider
              token={session.token}
              apiBaseUrl={session.apiBaseUrl}
              appearance={{ theme: 'light' }}
              onError={(e) => setMessage(`${e.code} — ${e.message}`)}
            >
              <Softphone />
            </SoftphoneProvider>
            <button onClick={disconnect} className={styles.linkButton}>
              Disconnect
            </button>
          </div>
        ) : (
          <div className={styles.connect}>
            <p className={styles.hint}>
              Mint a session and render the shared <code>&lt;Softphone /&gt;</code> component.
            </p>
            <button
              onClick={connect}
              disabled={status === 'connecting'}
              className={styles.button}
            >
              Connect
            </button>
          </div>
        )}
      </main>
    </div>
  );
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
