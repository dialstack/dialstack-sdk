'use client';

// Modular flow: the SAME pieces the batteries-included `<Softphone />` is built
// from — `DialPad`, `OngoingCall`, `IncomingStack`, `EmergencyBanner` —
// hand-composed into a bespoke, two-column layout, with a custom header driven
// by the accessor hooks
// (`useSoftphone`, `useActiveCall`, `useIncomingCall`, `useCallDuration`). It
// runs inside the SAME `<SoftphoneProvider>` as the batteries flow (owned by
// `page.tsx`), so switching between the two never reconnects.
//
// Everything here imports from the public `@dialstack/sdk/react` entry only.
import {
  DialPad,
  OngoingCall,
  IncomingStack,
  EmergencyBanner,
  useSoftphone,
  useActiveCall,
  useIncomingCall,
  useCallDuration,
  callPeerName,
  callPeerNumber,
} from '@dialstack/sdk/react';
import styles from './modular.module.css';

export const ModularFlow: React.FC = () => (
  <div className={styles.workspace}>
    <ModularHeader />
    {/* The E911 prompt is a standalone piece now — the batteries flow bundles it
        inside the dial pad, but here we hoist it to the top of the workspace to
        show it's fully decoupled. It self-hides once a location is bound. */}
    <EmergencyBanner />
    <div className={styles.columns}>
      {/* Left column: the dial pad is always mounted — placing a call while one
          is active holds the current call (the provider handles the switch).
          Note: no E911 banner inside the pad — it lives up top (above). */}
      <section className={styles.panel}>
        <h2 className={styles.panelTitle}>Dial</h2>
        <DialPad autoFocusDestination />
      </section>

      {/* Right column: whatever is happening on the line — a ringing inbound
          call, the active call, or an idle placeholder. */}
      <section className={styles.panel}>
        <h2 className={styles.panelTitle}>On the line</h2>
        <CallColumn />
      </section>
    </div>
  </div>
);

// A custom status header composed entirely from the accessor hooks — the point
// of the modular flow is that the host reads call state and lays it out however
// it likes, rather than accepting the drop-in's chrome.
const ModularHeader: React.FC = () => {
  const { connection } = useSoftphone();
  const { activeCall } = useActiveCall();
  const incoming = useIncomingCall();
  const duration = useCallDuration(activeCall);

  const line = activeCall
    ? `${callPeerName(activeCall) ?? callPeerNumber(activeCall)} · ${duration}`
    : incoming
      ? `Ringing — ${callPeerName(incoming) ?? callPeerNumber(incoming)}`
      : 'No active call';

  return (
    <div className={styles.header}>
      <span className={`${styles.connDot} ${styles[`conn_${connection}`] ?? ''}`} />
      <span className={styles.connLabel}>{connection}</span>
      <span className={styles.headerLine}>{line}</span>
    </div>
  );
};

// The right column swaps between the ringing inbound UI, the ongoing-call panel,
// and an idle placeholder. Each SDK piece is self-contained — `IncomingStack`
// renders all ringing calls (answer/decline), `OngoingCall` renders the
// foreground call — so we just drop them in; no scoped wrappers, no raw `Call`
// plumbing. `OngoingCall`/`IncomingStack` render nothing when there's nothing to
// show, so the idle placeholder covers the empty case.
const CallColumn: React.FC = () => {
  const { activeCall } = useActiveCall();
  const incoming = useIncomingCall();

  if (incoming && !activeCall) {
    return <IncomingStack />;
  }

  if (activeCall) {
    return <OngoingCall />;
  }

  return <p className={styles.idle}>Nothing on the line — dial a number to start.</p>;
};
