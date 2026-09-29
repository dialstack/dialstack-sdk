import { RTCAudioSession } from '@livekit/react-native-webrtc';
import * as Calls from 'expo-callkit-telecom';
import { isValidPhoneNumber } from 'libphonenumber-js';
import type {
  OsCallAdapter,
  OsCallEventName,
  OsCallEvents,
  OsIncomingCall,
  OsOutgoingCall,
  OsSessionId,
  OsSessionStatus,
} from '@dialstack/sdk-native';

/**
 * `OsCallAdapter` over expo-callkit-telecom (CallKit + Core-Telecom). The only
 * file that imports the library (eslint enforces it).
 */

/**
 * How long an unanswered incoming call may alert before this adapter tears it
 * down everywhere. Matches the server-side wake-park window: past it a woken
 * call is no longer answerable, so its notification and JS call would be a ghost.
 *
 * Temporarily raised to 300s while the background-call FGS work is outstanding
 * (a backgrounded live call takes longer to settle, and 30s was tearing down
 * still-valid calls). Return to ~30s once the park window is the real bound.
 */
const ANSWER_DEADLINE_MS = 300_000;

// Every live incoming session, by the call_id it was reported with
// (`serverCallId`): our own reports pass it, and a wake push carries it. The OS
// mints the session id, so this is what maps it back to the call.
// getActiveCallSession() can't stand in: it returns the ONE session the OS calls
// active, which need not be the one asked about.
const sessionsByCallId = new Map<string, Calls.CallSession>();
// call_ids of our own reports whose session never showed up in time. The report
// failed as far as the bridge knows, so the OS must not ring it: end it if its
// session appears late.
const abandonedCalls = new Set<string>();
// readBack()s asleep between polls, woken early when a session is added.
const sessionAddedWaiters = new Set<() => void>();

const callIdOf = (s: Calls.CallSession): string | null => s.incomingCallEvent?.serverCallId ?? null;

// `requesting` is an outbound call the OS hasn't started dialling yet; to the
// bridge that is as far from connected as ringing.
function osStatus(status: Calls.CallSessionStatus): OsSessionStatus {
  return status === 'requesting' ? 'ringing' : status;
}

function remember(s: Calls.CallSession): void {
  const callId = callIdOf(s);
  if (callId) sessionsByCallId.set(callId, s);
}

export function expoCallKitTelecomAdapter(): OsCallAdapter {
  // Fires for OUR reports and for a wake push's native ones alike. NOT enough on
  // its own: CALL_SESSION_ADDED has a queue limit of 0, so it is dropped rather
  // than replayed to a late-attaching listener, and on a cold wake every listener
  // is late (native reported the call before any JS existed). `incomingReported`,
  // the queued event, fills that gap below.
  Calls.addCallSessionAddedListener((e) => {
    const callId = callIdOf(e.session);
    if (callId && abandonedCalls.delete(callId)) {
      void Calls.reportCallEnded(e.session.id, 'failed').catch(() => {});
      return;
    }
    remember(e.session);
    for (const wake of sessionAddedWaiters) wake();
  });
  // The library tells WebRTC about CallKit's audio session, but the WebRTC it
  // is built against is not the one the calls run on: LiveKit's has its own
  // audio session. Untold, its engine starts before activation, fails, and only
  // recovers on its own retry, seconds later or never (a call with no audio).
  Calls.addAudioSessionDeactivatedListener(() => RTCAudioSession.audioSessionDidDeactivate());
  Calls.addCallSessionRemovedListener((e) => {
    // Only if it is still this session: the same call_id rings again on a
    // follow-me step, under a new session.
    for (const [callId, s] of sessionsByCallId) if (s.id === e.id) sessionsByCallId.delete(callId);
  });

  // The OS answer carries a requestId that must be fulfilled or failed; the port
  // speaks in sessions, so it is kept here.
  const answerRequests = new Map<OsSessionId, string>();
  // Unanswered-teardown timer per live session, cancelled when the session
  // resolves any other way.
  const answerDeadlines = new Map<OsSessionId, ReturnType<typeof setTimeout>>();

  // Drop every trace of a session, however it resolved.
  const forgetSession = (sessionId: OsSessionId): void => {
    const t = answerDeadlines.get(sessionId);
    if (t !== undefined) clearTimeout(t);
    answerDeadlines.delete(sessionId);
    answerRequests.delete(sessionId);
  };
  // Read-and-forget: a requestId may be fulfilled or failed exactly once, so
  // taking it here is what stops a second attempt on the same answer.
  const takeAnswerRequest = (sessionId: OsSessionId): string | undefined => {
    const requestId = answerRequests.get(sessionId);
    forgetSession(sessionId);
    return requestId;
  };
  const fan = new Fanout(answerRequests, forgetSession);

  return {
    async reportIncoming(call: OsIncomingCall): Promise<OsSessionId> {
      await Calls.reportIncomingCall({
        // The library wants a unique id per report; the session is found by
        // call_id, not by this.
        eventId: eventId(),
        serverCallId: call.callId,
        hasVideo: false,
        startedAt: new Date().toISOString(),
        caller: contactHandle(call.from, call.displayName),
      });
      // The library mints the session id natively and reportIncomingCall returns
      // void, so read it back. The session lands via CALL_SESSION_ADDED and can
      // trail the promise, so wait briefly rather than throw on the first miss —
      // a throw here would orphan a session the OS already rings (no id to end).
      const session = await readBack((s) => callIdOf(s) === call.callId);
      if (!session) {
        // The bridge will treat this report as failed and release the caller, so
        // the OS must not keep ringing a session nobody can name.
        abandonedCalls.add(call.callId);
        throw new Error('expoCallKitTelecomAdapter: reported call never became the active session');
      }
      // On expiry, end the OS session AND emit 'end' so the SDK call and bridge
      // state go down with it — the same path a real OS/user end takes.
      const sessionId = session.id;
      forgetSession(sessionId);
      answerDeadlines.set(
        sessionId,
        setTimeout(() => {
          forgetSession(sessionId);
          void Calls.reportCallEnded(sessionId, 'unanswered').catch(() => {});
          fan.emitEnd(sessionId);
        }, ANSWER_DEADLINE_MS)
      );
      return sessionId;
    },

    async reportOutgoing(call: OsOutgoingCall): Promise<OsSessionId> {
      // Starts the Telecom foreground service, so an outbound call survives
      // backgrounding like a received one. No answer deadline: the user placed it.
      return Calls.startOutgoingCall(contactHandle(call.to, call.displayName), { hasVideo: false });
    },

    async reportConnected(sessionId) {
      const requestId = takeAnswerRequest(sessionId);
      // Telecom tears the session down without the fulfil. Despite its name the
      // "outgoing" variant is the media-is-up report for any session not answered
      // through the OS.
      if (requestId) await Calls.fulfillIncomingCallConnected(requestId);
      else await Calls.reportOutgoingCallConnected(sessionId);
    },

    async reportEnded(sessionId, reason) {
      const requestId = takeAnswerRequest(sessionId);
      if (requestId) await Calls.failIncomingCallConnected(sessionId, requestId).catch(() => {});
      // reportCallEnded, never endCall: endCall re-emits CALL_ENDED, which the
      // bridge would take for a user hangup on an already-dead call.
      await Calls.reportCallEnded(sessionId, reason);
    },

    setHeld: (sessionId, held) => Calls.setHeld(sessionId, held),
    setMuted: (sessionId, muted) => Calls.setMuted(sessionId, muted),

    async getActiveSession() {
      const s = await Calls.getActiveCallSession();
      return s
        ? { sessionId: s.id, callId: callIdOf(s), status: osStatus(s.status), held: s.isOnHold }
        : null;
    },

    answer: (sessionId) => Calls.answerCall(sessionId),
    end: (sessionId) => Calls.endCall(sessionId),

    on: (event, listener) => fan.on(event, listener),
  };
}

/**
 * One native subscription per event, fanned out to port listeners. The
 * library replays a queued event to the FIRST subscriber only, so a second
 * native listener would swallow the replay the bridge depends on.
 */
class Fanout {
  private readonly listeners = new Map<OsCallEventName, Set<(e: never) => void>>();
  private readonly native = new Map<OsCallEventName, { remove(): void }>();

  constructor(
    private readonly answerRequests: Map<OsSessionId, string>,
    private readonly forgetSession: (sessionId: OsSessionId) => void
  ) {
    // Cleanup for a session the library dropped on its own.
    Calls.addCallSessionRemovedListener((e) => this.forgetSession(e.id));
  }

  on<K extends OsCallEventName>(event: K, listener: OsCallEvents[K]): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
      this.native.set(event, this.subscribe(event));
    }
    set.add(listener as (e: never) => void);
    return () => set?.delete(listener as (e: never) => void);
  }

  /** Deliver a synthetic 'end' (the unanswered-deadline teardown) to the bridge. */
  emitEnd(sessionId: OsSessionId): void {
    this.emit('end', { sessionId });
  }

  private emit<K extends OsCallEventName>(event: K, e: Parameters<OsCallEvents[K]>[0]): void {
    for (const l of this.listeners.get(event) ?? []) (l as (e: unknown) => void)(e);
  }

  private subscribe(event: OsCallEventName): { remove(): void } {
    switch (event) {
      case 'incomingReported':
        return Calls.addIncomingCallReportedListener((e) => {
          // The queued event, so the only session notification that survives a
          // cold wake, and it carries just the session id. The bridge pairs a
          // session with its call by call_id, so read the session back first
          // and report the call_id it was created with.
          void readBack((s) => s.id === e.id)
            .catch(() => null)
            .then((s) => {
              this.emit('incomingReported', { sessionId: e.id, callId: s ? callIdOf(s) : null });
            });
        });
      case 'callIntent':
        return Calls.addCallIntentReceivedListener((e) =>
          this.emit('callIntent', { handle: e.handle })
        );
      case 'answer':
        return Calls.addCallAnsweredListener((e) => {
          // A second tap while the first is unfulfilled: fail the newcomer
          // rather than strand the original until its timeout.
          if (this.answerRequests.has(e.id)) {
            void Calls.failIncomingCallConnected(e.id, e.requestId).catch(() => {});
            return;
          }
          this.answerRequests.set(e.id, e.requestId);
          this.emit('answer', { sessionId: e.id });
        });
      case 'end':
        return Calls.addCallEndedListener((e) => {
          this.forgetSession(e.id);
          this.emit('end', { sessionId: e.id });
        });
      case 'setHeld':
        return Calls.addSetHeldActionListener((e) =>
          this.emit('setHeld', { sessionId: e.id, held: e.isOnHold })
        );
      case 'setMuted':
        return Calls.addSetMutedActionListener((e) =>
          this.emit('setMuted', { sessionId: e.id, muted: e.isMuted })
        );
      case 'dtmf':
        return Calls.addDTMFListener((e) =>
          this.emit('dtmf', { sessionId: e.id, digits: e.digits })
        );
      case 'audioSessionActivated':
        return Calls.addAudioSessionActivatedListener((e) => {
          RTCAudioSession.audioSessionDidActivate();
          this.emit('audioSessionActivated', { sessionId: e.calls[0]?.id ?? null });
        });
    }
  }
}

const READ_BACK_ATTEMPTS = 10;
const READ_BACK_INTERVAL_MS = 50;

/**
 * Find a session the OS holds, waiting briefly for one that hasn't shown up yet.
 * A CALL_SESSION_ADDED wakes it at once; the poll is for the one it never gets.
 *
 * The library mints session ids natively and reports them only by event.
 * CALL_SESSION_ADDED can trail a report, and on a cold wake it is dropped
 * rather than queued, because native reported the call before any JS existed.
 * The sessionAdded record is read first: `getActiveCallSession()` returns
 * whichever ONE session the OS considers active, which need not be the one
 * asked about when a wake push lands for a different call at the same moment.
 */
async function readBack(
  match: (s: Calls.CallSession) => boolean
): Promise<Calls.CallSession | null> {
  for (let i = 0; i < READ_BACK_ATTEMPTS; i++) {
    for (const s of sessionsByCallId.values()) if (match(s)) return s;
    const active = await Calls.getActiveCallSession();
    if (active && match(active)) {
      remember(active);
      return active;
    }
    await new Promise<void>((resolve) => {
      const wake = () => {
        clearTimeout(timer);
        sessionAddedWaiters.delete(wake);
        resolve();
      };
      const timer = setTimeout(wake, READ_BACK_INTERVAL_MS);
      sessionAddedWaiters.add(wake);
    });
  }
  return null;
}

const PUSH_TOKEN_TIMEOUT_MS = 10_000;

/**
 * The device push token the backend needs to wake this app: FCM on Android,
 * APNs VoIP on iOS. Lives here because the library owns push registration.
 * Rejects after a timeout: a registration that never completes (no Play
 * Services, APNs refused, no network at boot) would otherwise hang the caller
 * silently, surfacing much later as "calls don't wake the app".
 */
export function getWakePushToken(): Promise<{ token: string; type: 'FCM' | 'APNS_VOIP' }> {
  return new Promise((resolve, reject) => {
    const current = Calls.getVoIPPushToken();
    if (current) {
      resolve(current);
      return;
    }
    const timer = setTimeout(() => {
      sub.remove();
      reject(new Error(`push token not received within ${PUSH_TOKEN_TIMEOUT_MS}ms`));
    }, PUSH_TOKEN_TIMEOUT_MS);
    const sub = Calls.addVoIPPushTokenUpdatedListener((e) => {
      if (!e.token) return;
      clearTimeout(timer);
      sub.remove();
      resolve({ token: e.token, type: e.type });
    });
    Calls.registerVoIPPush();
  });
}

// libphonenumber-js, not a shape regex: `+99999999999` is the right length and
// has no country code that exists. The `+` guard is still ours — isValidPhoneNumber
// also accepts national format, and the OS wants E.164 specifically.
const isE164 = (s: string): boolean => s.startsWith('+') && isValidPhoneNumber(s);

/**
 * The remote party as the library wants it. `phoneNumber` is omitted unless the
 * handle really is E.164 — the library requires that format there, and an
 * extension is not one.
 */
function contactHandle(handle: string, displayName?: string | null) {
  return {
    id: handle,
    displayName: displayName ?? handle,
    ...(isE164(handle) ? { phoneNumber: handle } : {}),
  };
}

// Only has to be distinct within the library's 120s dedup window. React Native
// ships no `crypto.randomUUID` and registerGlobals() adds none, so reaching for
// one would mean a polyfill dependency for a value nothing checks the shape of.
function eventId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
