/**
 * The OS call surface (CallKit on iOS, Telecom on Android) as the bridge needs
 * it — shaped by the bridge, not by any library. See the contract suite for
 * what an adapter must guarantee.
 */

/** OS-side call identity: the UUID CallKit/Telecom track the call under. */
export type OsSessionId = string;

export interface OsIncomingCall {
  callId: string;
  /** Caller handle as the OS should display/dial it. */
  from: string;
  displayName?: string | null;
}

export interface OsOutgoingCall {
  /** The recipient handle the OS should display/dial. */
  to: string;
  displayName?: string | null;
}

/**
 * Why the call ended, in the OS's vocabulary. `answeredElsewhere` /
 * `declinedElsewhere` make the OS dismiss the ring silently instead of logging
 * a missed call.
 */
export type OsEndReason =
  'remoteEnded' | 'unanswered' | 'answeredElsewhere' | 'declinedElsewhere' | 'failed' | 'unknown';

export interface OsActiveSession {
  sessionId: OsSessionId;
  callId: string | null;
}

export interface OsCallEvents {
  /** A call was reported to the OS — by native code before JS existed, or by `reportIncoming`. */
  incomingReported: (e: OsActiveSession) => void;
  /** The OS wants to PLACE a call — the user dialled from the platform's own UI
   *  (Recents, Siri, dialer intent), not from the app. */
  callIntent: (e: { handle: string }) => void;
  answer: (e: { sessionId: OsSessionId }) => void;
  end: (e: { sessionId: OsSessionId }) => void;
  setHeld: (e: { sessionId: OsSessionId; held: boolean }) => void;
  setMuted: (e: { sessionId: OsSessionId; muted: boolean }) => void;
  dtmf: (e: { sessionId: OsSessionId; digits: string }) => void;
  /** iOS only in practice: CallKit gates audio, so WebRTC audio starts here. */
  audioSessionActivated: (e: { sessionId: OsSessionId | null }) => void;
}

export type OsCallEventName = keyof OsCallEvents;

export interface OsCallAdapter {
  /** Resolves to the OS-assigned session id (the OS assigns, never the caller). */
  reportIncoming(call: OsIncomingCall): Promise<OsSessionId>;
  /**
   * Report an outbound call so the OS holds a live session — on Android that
   * starts the foreground service keeping the process and call alive when
   * backgrounded, which an outbound call otherwise lacks.
   */
  reportOutgoing(call: OsOutgoingCall): Promise<OsSessionId>;
  /** The call the OS is showing as incoming/dialling is now connected. */
  reportConnected(sessionId: OsSessionId): Promise<void>;
  /** Must not re-emit `end` — the bridge is telling the OS, not the other way round. */
  reportEnded(sessionId: OsSessionId, reason: OsEndReason): Promise<void>;
  /** Remote-initiated state only; the OS already knows about its own actions. */
  setHeld(sessionId: OsSessionId, held: boolean): Promise<void>;
  setMuted(sessionId: OsSessionId, muted: boolean): Promise<void>;
  getActiveSession(): Promise<OsActiveSession | null>;
  /**
   * The app's own Answer/End buttons go through the OS too, so every answer —
   * lock screen, notification, car, watch, in-app — arrives as the same
   * `answer`/`end` event and there is one code path, not two.
   */
  answer(sessionId: OsSessionId): Promise<void>;
  end(sessionId: OsSessionId): Promise<void>;
  on<K extends OsCallEventName>(event: K, listener: OsCallEvents[K]): () => void;
}
