'use client';

import { useEffect, useRef, useState } from 'react';
import {
  DialStackPhone,
  type Call,
  type CallEndReason,
  type EmergencyAddress,
  type EmergencyAddressInput,
} from '@dialstack/sdk/webrtc';
import styles from './page.module.css';

const EMPTY_E911_FORM: EmergencyAddressInput = {
  address_number: '',
  street: '',
  unit: '',
  city: '',
  state: '',
  postal_code: '',
};

type Status = 'idle' | 'connecting' | 'connected' | 'disconnected' | 'error';

type UserOption = { id: string; name: string | null; email: string | null };

function userLabel(u: UserOption): string {
  return u.name || u.email || u.id;
}

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
  // The emergency-address id is presented on every (re)connect so the server
  // binds it to the current network. We mirror it in a ref because connect()
  // builds a fresh phone and needs the latest id synchronously, before React
  // state has flushed.
  const emergencyIdRef = useRef<string | null>(null);
  // The user the softphone connects as. Mirrored in a ref because the
  // onTokenExpiring callback (below) re-mints for the same user and needs the
  // latest selection synchronously, without being rebuilt on every render.
  const [users, setUsers] = useState<UserOption[] | null>(null);
  const [selectedUser, setSelectedUser] = useState<string>('');
  const selectedUserRef = useRef<string>('');
  const [status, setStatus] = useState<Status>('idle');
  const [message, setMessage] = useState<string>('');
  const [destination, setDestination] = useState<string>('');
  const [dtmf, setDtmf] = useState<string>('');
  const [transferDest, setTransferDest] = useState<string>('');
  const [calls, setCalls] = useState<Record<string, { view: CallView; call: Call }>>({});
  const [emergency, setEmergency] = useState<EmergencyAddress | null>(null);
  const [e911Form, setE911Form] = useState<EmergencyAddressInput>(EMPTY_E911_FORM);
  const [e911Busy, setE911Busy] = useState<boolean>(false);
  // The SDK reported the device moved networks (network.changed): the current
  // binding points at the old location until re-bound. Distinct from notBound
  // so a failed re-bind doesn't read as a fresh "never bound".
  const [networkChanged, setNetworkChanged] = useState<boolean>(false);
  // The saved address has no network binding yet (registered_ip === null):
  // outbound PSTN stays blocked until it binds.
  const [notBound, setNotBound] = useState<boolean>(false);

  useEffect(() => {
    return () => {
      phoneRef.current?.disconnect();
    };
  }, []);

  // Load the account's users for the "connect as" picker. Auto-select when
  // there's exactly one so a single-user account connects without a choice.
  useEffect(() => {
    void (async () => {
      try {
        const resp = await fetch('/api/users');
        if (!resp.ok) throw new Error(await resp.text());
        const { users } = (await resp.json()) as { users: UserOption[] };
        setUsers(users);
        if (users.length === 1) setSelectedUser(users[0].id);
      } catch (e) {
        setUsers([]);
        setMessage(`Could not load users: ${(e as Error).message}`);
      }
    })();
  }, []);

  useEffect(() => {
    selectedUserRef.current = selectedUser;
  }, [selectedUser]);

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

  // Mint a fresh user session for the currently-selected user. Shared by the
  // initial connect and the onTokenExpiring refresh so both hit the same route
  // with the same user id.
  const mintSession = async (): Promise<{ token: string; apiBaseUrl: string }> => {
    const resp = await fetch('/api/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user: selectedUserRef.current }),
    });
    if (!resp.ok) {
      const body = await resp.text();
      throw new Error(`session mint failed: ${body}`);
    }
    return (await resp.json()) as { token: string; apiBaseUrl: string };
  };

  const connect = async () => {
    setStatus('connecting');
    setMessage('Minting user session …');
    try {
      const { token, apiBaseUrl } = await mintSession();

      const phone = new DialStackPhone({
        token,
        apiBaseUrl,
        // Refresh the token in-band shortly before it expires (no reconnect). The
        // SDK calls this ~60s ahead of exp; we re-mint for the same user and hand
        // back the fresh token. A real product would mint per its own authenticated
        // end-user here.
        onTokenExpiring: async () => {
          const { token } = await mintSession();
          return token;
        },
        // Present the selected emergency address so the server binds it to this
        // network during the authenticate handshake. Without a bound address,
        // outbound calls to phone numbers are blocked (internal/inbound still work).
        emergencyAddressId: emergencyIdRef.current ?? undefined,
      });
      phone.on('connected', () => {
        setStatus('connected');
        setMessage('');
      });
      phone.on('network.changed', () => {
        setNetworkChanged(true);
        setMessage('Network changed — re-bind your emergency address so 911 routes to your current location.');
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
        // The transport re-binds the address server-side on reconnect; refresh
        // so a now-resolved network.changed warning clears (and a moved binding
        // doesn't keep reading as bound). This gates 911 routing.
        void refreshEmergencyStatus();
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
      // Awaited (not in the 'connected' handler) so callers that reconnect to
      // (re)bind an address — saveEmergencyAddress / rebindForCurrentNetwork —
      // stay busy until the panel reflects the new binding state.
      await refreshEmergencyStatus();
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
    setNetworkChanged(false);
    setNotBound(false);
  };

  // Pull the user's saved emergency address so the panel reflects whether
  // outbound PSTN is unblocked. Best-effort: failures just leave the panel as-is.
  const refreshEmergencyStatus = async () => {
    const phone = phoneRef.current;
    if (!phone) return;
    try {
      const page = await phone.listEmergencyAddresses();
      const current =
        (emergencyIdRef.current && page.data.find((a) => a.id === emergencyIdRef.current)) ||
        page.data[0] ||
        null;
      setEmergency(current);
      if (current) {
        emergencyIdRef.current = current.id;
        // registered_ip === null means saved but not bound to a network yet.
        const bound = current.registered_ip !== null;
        setNotBound(!bound);
        // A confirmed binding resolves any earlier moved-network warning.
        if (bound) setNetworkChanged(false);
        setE911Form({
          address_number: current.address.address_number ?? '',
          street: current.address.street ?? '',
          unit: current.address.unit ?? '',
          city: current.address.city,
          state: current.address.state,
          postal_code: current.address.postal_code,
        });
      } else {
        setNotBound(false);
        setNetworkChanged(false);
      }
    } catch {
      /* status display is best-effort */
    }
  };

  const setE911Field =
    (field: keyof EmergencyAddressInput) => (e: React.ChangeEvent<HTMLInputElement>) =>
      setE911Form((prev) => ({ ...prev, [field]: e.target.value }));

  // Validate + save the address, then reconnect so it binds to the current
  // network. A freshly created address has no binding, so a plain reconnect is
  // enough to bind it.
  const saveEmergencyAddress = async () => {
    const phone = phoneRef.current;
    if (!phone) return;
    setE911Busy(true);
    try {
      setMessage('Validating emergency address …');
      const addr = await phone.setEmergencyAddress(e911Form);
      emergencyIdRef.current = addr.id;
      setEmergency(addr);
      setMessage('Address saved. Binding it to this network …');
      await reconnect();
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setE911Busy(false);
    }
  };

  // Re-bind after a network change: clear the stale binding, then reconnect so
  // the server registers the address against the network the device is on now.
  const rebindForCurrentNetwork = async () => {
    const phone = phoneRef.current;
    const id = emergencyIdRef.current;
    if (!phone || !id) return;
    setE911Busy(true);
    try {
      setMessage('Re-binding emergency address to this network …');
      await phone.clearEmergencyAddressRegisteredIp(id);
      await reconnect();
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setE911Busy(false);
    }
  };

  // Tear down and reconnect. The new session presents emergencyIdRef on its
  // authenticate handshake, which is where the network binding happens.
  const reconnect = async () => {
    phoneRef.current?.disconnect();
    phoneRef.current = null;
    // disconnect() disposes the old Call objects without emitting 'ended', so
    // clear them here too — otherwise they'd render live-looking controls
    // pointing at a disposed phone (mirrors disconnect()).
    setCalls({});
    await connect();
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
          <h2 className={styles.panelTitle}>Connect as</h2>
          {status !== 'connected' ? (
            users === null ? (
              <p className={styles.empty}>Loading users …</p>
            ) : users.length === 0 ? (
              <p className={styles.empty}>
                No users in this account. Create a user first, then reload.
              </p>
            ) : (
              <div className={styles.row}>
                <select
                  value={selectedUser}
                  onChange={(e) => setSelectedUser(e.target.value)}
                  disabled={status === 'connecting'}
                  className={styles.input}
                >
                  <option value="" disabled>
                    Select a user …
                  </option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {userLabel(u)}
                    </option>
                  ))}
                </select>
                <button
                  onClick={connect}
                  disabled={status === 'connecting' || !selectedUser}
                  className={`${styles.button} ${styles.buttonPrimary}`}
                >
                  Connect
                </button>
              </div>
            )
          ) : (
            <div className={styles.row}>
              <button onClick={disconnect} className={styles.button}>
                Disconnect
              </button>
            </div>
          )}
        </section>

        <section className={styles.panel}>
          <h2 className={styles.panelTitle}>Emergency address (E911)</h2>
          {status !== 'connected' ? (
            <p className={styles.empty}>Connect to register or view your emergency address.</p>
          ) : (
            <>
              <div className={styles.e911Status}>
                {emergency ? (
                  emergency.registered_ip ? (
                    <span className={styles.e911Ok}>
                      ✓ {emergency.address.formatted_address ?? emergency.address.street} — bound to this
                      network. Outbound calls to phone numbers are enabled.
                    </span>
                  ) : (
                    <span className={styles.e911Blocked}>
                      Saved but not bound to a network yet — outbound calls to phone numbers are blocked
                      until it binds. Reconnect to bind it.
                    </span>
                  )
                ) : (
                  <span className={styles.e911Blocked}>
                    No emergency address registered. Calls to phone numbers are blocked until you add one.
                    (Internal and inbound calls work without it.)
                  </span>
                )}
              </div>

              {emergency && (networkChanged || notBound) && (
                <div className={styles.e911Warning}>
                  <span>
                    {networkChanged
                      ? 'Your network changed — re-bind so 911 routes to where you are now.'
                      : 'Saved but not bound to a network yet — bind it to enable outbound calls.'}
                  </span>
                  <button
                    onClick={() => void rebindForCurrentNetwork()}
                    disabled={e911Busy}
                    className={`${styles.button} ${styles.buttonPrimary}`}
                  >
                    {networkChanged ? 'Re-bind' : 'Bind'}
                  </button>
                </div>
              )}

              <div className={styles.fieldGrid}>
                <input
                  className={styles.input}
                  placeholder="Street number"
                  value={e911Form.address_number ?? ''}
                  onChange={setE911Field('address_number')}
                  autoComplete="off"
                  required
                />
                <input
                  className={styles.input}
                  placeholder="Street"
                  value={e911Form.street}
                  onChange={setE911Field('street')}
                  autoComplete="off"
                />
                <input
                  className={styles.input}
                  placeholder="Unit (optional)"
                  value={e911Form.unit ?? ''}
                  onChange={setE911Field('unit')}
                  autoComplete="off"
                />
                <input
                  className={styles.input}
                  placeholder="City"
                  value={e911Form.city}
                  onChange={setE911Field('city')}
                  autoComplete="off"
                />
                <input
                  className={styles.input}
                  placeholder="State (e.g. TX)"
                  value={e911Form.state}
                  onChange={setE911Field('state')}
                  autoComplete="off"
                />
                <input
                  className={styles.input}
                  placeholder="ZIP"
                  value={e911Form.postal_code}
                  onChange={setE911Field('postal_code')}
                  autoComplete="off"
                />
              </div>
              <div className={styles.row}>
                <button
                  onClick={() => void saveEmergencyAddress()}
                  disabled={
                    e911Busy ||
                    !e911Form.address_number ||
                    !e911Form.street ||
                    !e911Form.city ||
                    !e911Form.state ||
                    !e911Form.postal_code
                  }
                  className={`${styles.button} ${styles.buttonPrimary}`}
                >
                  {e911Busy ? 'Working …' : emergency ? 'Update & bind address' : 'Save & bind address'}
                </button>
              </div>
            </>
          )}
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
