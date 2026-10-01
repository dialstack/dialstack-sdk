// One softphone connection per browser, shared by every tab of the app.
//
// One tab is elected leader with the Web Locks API. Only the leader creates a
// DialStackPhone, so the user's whole browser uses one of their three softphone
// sessions however many tabs are open. The leader relays call state to the
// other tabs over a BroadcastChannel and runs the commands they send it. When
// the leader tab closes, the lock passes to the next tab, which connects.
import { DialStackPhone } from '@dialstack/sdk-webrtc';

const NAME = 'dialstack-phone';

/**
 * @param {object} options
 * @param {() => Promise<string>} options.fetchToken Returns a fresh user session
 *   token from your backend.
 * @param {(state: SharedPhoneState, tab: { isLeader: boolean }) => void} options.render
 *   Draws the phone UI in this tab. Called in every tab whenever anything changes.
 *   Show a prompt to confirm the emergency location while `state.needsLocation`.
 * @param {(error: { action: string, callId?: string, code: string, message: string }) => void} options.showError
 *   Tells the user that a command they sent from this tab failed.
 * @param {object} [options.phoneOptions] Extra `PhoneOptions` for the leader's phone.
 * @returns {{ send: (command: object) => void, isLeader: () => boolean, phone: () => DialStackPhone | null }}
 *
 * @typedef {object} SharedPhoneState
 * @property {string} status 'connecting', 'connected', 'replaced', 'disconnected' or an error code.
 * @property {boolean} needsLocation The network changed: ask the user to confirm their location.
 * @property {Array<{ id: string, direction: string, state: string, from: string, fromName: string | null, to: string, isMuted: boolean }>} calls
 */
export function createSharedPhone({ fetchToken, render, showError, phoneOptions = {} }) {
  const channel = new BroadcastChannel(NAME);
  const tabId = crypto.randomUUID();
  let isLeader = false;
  let phone = null; // the leader's phone
  let status = 'connecting';
  let needsLocation = false;
  let speakerId = null;
  const players = new Map(); // call id -> the <audio> element playing it

  function snapshot() {
    const calls = (phone?.activeCalls ?? [])
      .filter((call) => call.state !== 'ended')
      .map(({ id, direction, state, from, fromName, to, isMuted }) => ({
        id,
        direction,
        state,
        from,
        fromName,
        to,
        isMuted,
      }));
    return { status, needsLocation, calls };
  }

  // What every tab does with a message from the leader.
  function show(message) {
    if (message.type === 'state') render(message.state, { isLeader });
    if (message.type === 'error' && message.to === tabId) showError(message);
  }

  // Leader: deliver to every tab, this one included. A BroadcastChannel does
  // not deliver a message back to the tab that sent it.
  function broadcast(message) {
    show(message);
    channel.postMessage(message);
  }

  function publish() {
    broadcast({ type: 'state', state: snapshot() });
  }

  function setStatus(next) {
    status = next;
    publish();
  }

  function applySpeaker(audio) {
    // iOS Safari has no setSinkId. A rejection leaves the element on its
    // previous speaker, so audio keeps playing.
    if (speakerId && typeof audio.setSinkId === 'function') {
      audio.setSinkId(speakerId).catch(() => undefined);
    }
  }

  function track(call) {
    // One element per call, attached from the start so early media (ringback,
    // carrier announcements) plays and a resumed call plays its own audio.
    const audio = new Audio();
    audio.autoplay = true;
    audio.srcObject = call.remoteMediaStream;
    applySpeaker(audio);
    players.set(call.id, audio);
    for (const event of ['ringing', 'answered', 'held', 'resumed']) {
      call.on(event, publish);
    }
    // A background tab may block autoplay while an inbound call is still
    // ringing. Once the call is answered the tab is capturing the microphone,
    // which lets play() start.
    call.on('answered', () => audio.play().catch(() => undefined));
    call.on('ended', () => {
      audio.srcObject = null;
      players.delete(call.id);
      publish();
    });
    publish();
  }

  function createPhone(token) {
    const created = new DialStackPhone({ ...phoneOptions, token, onTokenExpiring: fetchToken });
    // Ignore events from a phone that a later connection attempt has replaced.
    const on = (event, handler) =>
      created.on(event, (...args) => created === phone && handler(...args));
    on('incoming', track);
    on('connected', () => setStatus('connected'));
    on('reconnecting', () => setStatus('connecting'));
    on('reconnected', () => setStatus('connected'));
    // `disconnected` means no reconnect will follow: session_replaced,
    // auth_expired, session_revoked, or a drop with autoReconnect off.
    on('disconnected', (error) =>
      setStatus(error?.code === 'session_replaced' ? 'replaced' : 'disconnected')
    );
    // The emergency address no longer applies on this network. The leader is
    // often a background tab, so the prompt travels in the state every tab renders.
    on('network.changed', () => {
      needsLocation = true;
      publish();
    });
    return created;
  }

  // One connection attempt at a time, however many tabs ask for one.
  let starting = null;
  function start() {
    starting ??= connectWithRetry().finally(() => (starting = null));
    return starting;
  }

  // Connect with a fresh token on every attempt, so a token the server rejects
  // isn't retried forever. Back off between attempts.
  async function connectWithRetry() {
    phone?.disconnect();
    phone = null;
    for (let delay = 1000; ; delay = Math.min(delay * 2, 60_000)) {
      setStatus('connecting');
      try {
        phone = createPhone(await fetchToken());
        await phone.connect();
        return;
      } catch (error) {
        phone?.disconnect();
        setStatus(error.code ?? 'disconnected');
        await new Promise((retry) => setTimeout(retry, delay));
      }
    }
  }

  async function run(command) {
    const { action, callId, deviceId } = command;
    // Don't reconnect on your own after session_replaced: that would push out
    // another of the user's sessions. Reconnect when the user asks.
    if (action === 'connect') return start();
    if (!phone?.isConnected) throw new Error('The phone is not connected');
    switch (action) {
      case 'call':
        return track(await phone.call(command.destination));
      case 'answer':
      case 'reject':
      case 'hangup':
      case 'hold':
      case 'resume':
      case 'mute':
      case 'unmute': {
        const call = phone.getCall(callId);
        if (!call) throw new Error('That call has ended');
        return call[action]();
      }
      case 'setMicrophone':
        return phone.setAudioInputDevice(deviceId);
      case 'setSpeaker':
        speakerId = deviceId;
        players.forEach(applySpeaker);
        return;
      case 'setEmergencyAddress': {
        // Reconnecting applies the address, and ends any call in progress.
        const address = await phone.setEmergencyAddress(command.address);
        await phone.reconnectWithEmergency(address.id);
        needsLocation = false;
        return publish();
      }
      default:
        throw new Error(`Unknown action ${action}`);
    }
  }

  function execute(command) {
    // Wrapped in an async function so that a synchronous throw is caught too.
    (async () => run(command))().catch((error) =>
      broadcast({
        type: 'error',
        to: command.from,
        action: command.action,
        callId: command.callId,
        code: error.code ?? 'command_failed',
        message: error.message,
      })
    );
  }

  // Call this from any tab's buttons, e.g. send({ action: 'answer', callId }).
  function send(command) {
    const stamped = { ...command, from: tabId };
    if (isLeader) execute(stamped);
    else channel.postMessage({ type: 'command', command: stamped });
  }

  channel.onmessage = ({ data }) => {
    if (!isLeader) return show(data);
    if (data.type === 'command') execute(data.command);
    if (data.type === 'sync') publish(); // a tab just opened
  };

  render(snapshot(), { isLeader });
  channel.postMessage({ type: 'sync' });

  // Every tab requests the lock, so while any tab is open, one of them leads.
  navigator.locks.request(NAME, async () => {
    isLeader = true;
    await start();
    // Hold the lock, and with it the connection, until this tab closes.
    await new Promise(() => {});
  });

  return { send, isLeader: () => isLeader, phone: () => phone };
}
