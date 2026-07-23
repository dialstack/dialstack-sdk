'use client';

import { useState } from 'react';
// The web softphone UI ships from `@dialstack/sdk/react` — it bundles the web
// components together with the shared headless "brain" (hooks + provider base).
// React Native apps use the separate `@dialstack/sdk-native` package instead.
import { SoftphoneProvider } from '@dialstack/sdk/react';
import { BatteriesFlow } from './batteries/BatteriesFlow';
import { ModularFlow } from './modular/ModularFlow';
import styles from './page.module.css';

type Session = { token: string; apiBaseUrl: string };
type Status = 'idle' | 'connecting' | 'connected' | 'error';
// Two ways to embed the phone, both driven by ONE provider — the toggle only
// swaps which UI renders under it, never remounts the provider or reconnects.
type Flow = 'batteries' | 'modular';

const Page: React.FC = () => {
  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [message, setMessage] = useState<string>('');
  const [flow, setFlow] = useState<Flow>('batteries');

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
            {/* ONE provider owns the connection, audio, and E911 flow. The toggle
                below only swaps which UI renders inside it — so moving between
                the batteries-included <Softphone /> and the hand-composed modular
                layout never tears down the provider or reconnects. */}
            <SoftphoneProvider
              token={session.token}
              apiBaseUrl={session.apiBaseUrl}
              appearance={{ theme: 'light' }}
              onError={(e) => setMessage(`${e.code} — ${e.message}`)}
            >
              <FlowToggle flow={flow} onChange={setFlow} />
              {flow === 'batteries' ? <BatteriesFlow /> : <ModularFlow />}
            </SoftphoneProvider>
            <button onClick={disconnect} className={styles.linkButton}>
              Disconnect
            </button>
          </div>
        ) : (
          <div className={styles.connect}>
            <p className={styles.hint}>
              Mint a session, then switch between the drop-in <code>&lt;Softphone /&gt;</code> and a
              layout hand-composed from the individual pieces.
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
};

export default Page;

// Labeled tabs at the top of the phone: "Batteries-included" vs "Modular
// components". Purely presentational — it flips a bit of parent state; the
// provider underneath stays mounted across the switch.
const FlowToggle: React.FC<{ flow: Flow; onChange: (flow: Flow) => void }> = ({
  flow,
  onChange,
}) => (
  <div className={styles.toggle} role="tablist" aria-label="Softphone example flow">
    <button
      type="button"
      role="tab"
      aria-selected={flow === 'batteries'}
      className={`${styles.tab} ${flow === 'batteries' ? styles.tabActive : ''}`}
      onClick={() => onChange('batteries')}
    >
      Batteries-included
    </button>
    <button
      type="button"
      role="tab"
      aria-selected={flow === 'modular'}
      className={`${styles.tab} ${flow === 'modular' ? styles.tabActive : ''}`}
      onClick={() => onChange('modular')}
    >
      Modular components
    </button>
  </div>
);

const Logo: React.FC = () => (
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
