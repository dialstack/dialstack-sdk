/**
 * WebRTC platform primitives + types the call/signaling core builds on.
 *
 * There is no longer a `.native` counterpart to this module. The core is written
 * to the standard browser WebRTC surface (`globalThis.RTCPeerConnection`,
 * `MediaStream`, `navigator.mediaDevices`); React Native makes that surface exist
 * at runtime by calling `react-native-webrtc`'s `registerGlobals()` at app
 * startup (see the RN example apps). The two genuinely-RN-only gaps — ringback
 * audio (WebAudio vs InCallManager) and key/value persistence (localStorage vs a
 * host store) — are NOT resolved here; they are injected by the caller
 * (`PhoneOptions.ringback` / `PhoneOptions.storage`).
 *
 * The factory functions read the relevant global *lazily* (at call time, not at
 * module load) so a test harness that swaps `globalThis.RTCPeerConnection` /
 * `MediaStream` / `navigator` in a `beforeEach` still takes effect — capturing
 * the constructors in module-scope `const`s would bind whatever existed when
 * this module was first imported (often `undefined` under jsdom).
 *
 * WebRTC TYPES are re-exported here so the core imports them from `./platform`
 * rather than depending on the ambient `lib.dom.d.ts` names directly.
 */

// --- WebRTC types (web: alias the DOM lib) --------------------------------
export type RTCPeerConnection = globalThis.RTCPeerConnection;
export type MediaStream = globalThis.MediaStream;
export type MediaStreamTrack = globalThis.MediaStreamTrack;
export type RTCIceServer = globalThis.RTCIceServer;
export type RTCSessionDescriptionInit = globalThis.RTCSessionDescriptionInit;
export type RTCIceCandidateInit = globalThis.RTCIceCandidateInit;
export type RTCDTMFSender = globalThis.RTCDTMFSender;
export type MediaStreamConstraints = globalThis.MediaStreamConstraints;
export type MediaDeviceInfo = globalThis.MediaDeviceInfo;

// --- WebRTC primitives -----------------------------------------------------

/** Construct a peer connection with the given ICE servers. */
export function createPeerConnection(iceServers: RTCIceServer[]): RTCPeerConnection {
  return new globalThis.RTCPeerConnection({ iceServers });
}

/** Construct an empty media stream (tracks are added as they're acquired). */
export function createMediaStream(): MediaStream {
  return new globalThis.MediaStream();
}

/** Acquire local capture (the mic) — wraps `navigator.mediaDevices.getUserMedia`. */
export function getUserMedia(constraints: MediaStreamConstraints): Promise<MediaStream> {
  return globalThis.navigator.mediaDevices.getUserMedia(constraints);
}

/**
 * Wraps `enumerateDevices`, resolving to `[]` rather than rejecting where it's absent
 * or partial (some WebViews, React Native) so a picker needn't handle a throw.
 */
export async function enumerateDevices(): Promise<MediaDeviceInfo[]> {
  const mediaDevices = globalThis.navigator?.mediaDevices;
  if (typeof mediaDevices?.enumerateDevices !== 'function') return [];
  try {
    return await mediaDevices.enumerateDevices();
  } catch {
    return [];
  }
}

/**
 * Subscribe to `devicechange`; returns an unsubscribe function.
 *
 * `mediaDevices` is not an EventTarget on every host (React Native, test stubs), so a
 * missing `addEventListener` yields a no-op unsubscriber — deciding both halves behind
 * one check leaves no "subscribed but can't unsubscribe" state.
 */
export function onDeviceChange(handler: () => void): () => void {
  const mediaDevices = globalThis.navigator?.mediaDevices;
  if (typeof mediaDevices?.addEventListener !== 'function') return () => {};
  mediaDevices.addEventListener('devicechange', handler);
  return () => {
    try {
      mediaDevices.removeEventListener('devicechange', handler);
    } catch {
      // The host may have been swapped out underneath us (tests).
    }
  };
}

// --- pranswer capability probe ---------------------------------------------

/**
 * Whether this WebRTC stack can apply a JSEP provisional answer
 * (`setRemoteDescription({type:'pranswer'})`), used to relay carrier network
 * early media so ringback/announcements play before the callee picks up.
 *
 * Firefox has never implemented pranswer — it rejects with `NotSupportedError:
 * pranswer not yet implemented` (Mozilla bug 1004510, open since 2014). There is
 * no feature flag or interface to test for it, so the only honest probe is to
 * attempt the operation on a throwaway peer connection and see whether the stack
 * refuses. The probe result is cached: it's a per-engine constant, and building a
 * PeerConnection per call would be wasteful.
 *
 * A *remote* pranswer is only legal from `have-local-offer` (webrtc-pc: for type
 * "pranswer"/"answer" the state must be have-local-offer or have-remote-pranswer;
 * see the WPT RTCPeerConnection-setRemoteDescription-pranswer tests). So the probe
 * mirrors the real outbound flow: createOffer → setLocalDescription(offer) → apply
 * a pranswer as the REMOTE description. Chrome/Safari accept it; Firefox rejects
 * with NotSupportedError. Any failure before that step is inconclusive, so we
 * report `true` and let the real call path surface a genuine error rather than
 * silently disabling early media everywhere.
 *
 * The SDP fed back is this PC's own answer-shaped description. Rolling our own
 * offer back in as the remote description would land in have-remote-offer, where
 * a remote pranswer is an illegal transition — that misread Chrome as unsupported.
 */
let pranswerSupport: Promise<boolean> | null = null;

export function supportsPranswer(): Promise<boolean> {
  pranswerSupport ??= probePranswerSupport();
  return pranswerSupport;
}

async function probePranswerSupport(): Promise<boolean> {
  const PC = globalThis.RTCPeerConnection;
  // Inconclusive, not a refusal — same policy as every other pre-pranswer failure
  // below. The globals are read lazily precisely because hosts install them late
  // (React Native's registerGlobals(), WebView shims), and connect() warms this
  // probe eagerly — so a missing constructor here means "we couldn't tell yet",
  // not "unsupported". Caching false would strand the whole session with early
  // media disabled and a misleading Firefox warning on a capable stack.
  if (typeof PC !== 'function') return true;
  let pc: globalThis.RTCPeerConnection | null = null;
  let peer: globalThis.RTCPeerConnection | null = null;
  try {
    pc = new PC({});
    pc.addTransceiver('audio', { direction: 'recvonly' });
    const offer = await pc.createOffer();
    // setLocalDescription (not setRemoteDescription) — this is what puts us in
    // have-local-offer, the state a remote pranswer is legal from.
    await pc.setLocalDescription(offer);

    // A second throwaway PC answers our offer, purely to obtain answer-shaped SDP
    // that matches it. Deriving it on `pc` itself isn't possible: createAnswer
    // requires a remote offer, and applying one would leave have-local-offer.
    peer = new PC({});
    await peer.setRemoteDescription({ type: 'offer', sdp: offer.sdp });
    const answer = await peer.createAnswer();

    try {
      await pc.setRemoteDescription({ type: 'pranswer', sdp: answer.sdp });
    } catch {
      // The stack refused a legal pranswer transition — the Firefox case.
      return false;
    }
    return true;
  } catch {
    // The probe could not be set up (headless/stub stack, no transceiver support,
    // …). Inconclusive, not a refusal — assume supported.
    return true;
  } finally {
    for (const conn of [pc, peer]) {
      try {
        conn?.close();
      } catch {
        // Already closed.
      }
    }
  }
}

/** Test seam: forget the cached probe result so a suite can re-probe. */
export function resetPranswerSupportForTests(): void {
  pranswerSupport = null;
}

// --- Persistence shim ------------------------------------------------------

/**
 * Synchronous key/value persistence for the E911 address id. This web default is
 * backed by `localStorage`, guarded so the core also works in non-browser hosts
 * (Node/tests) where `localStorage` is absent — there, persistence is a no-op and
 * the app supplies `PhoneOptions.emergencyAddressId` itself. React Native has no
 * `localStorage`, so the RN softphone provider injects a host-backed adapter via
 * `PhoneOptions.storage` (MMKV/AsyncStorage); this default is never reached there.
 */
export interface PlatformStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const storage: PlatformStorage = {
  getItem(key) {
    try {
      return globalThis.localStorage?.getItem(key) ?? null;
    } catch {
      return null;
    }
  },
  setItem(key, value) {
    try {
      globalThis.localStorage?.setItem(key, value);
    } catch {
      // No localStorage (Node / restricted host) — persistence is best-effort.
    }
  },
  removeItem(key) {
    try {
      globalThis.localStorage?.removeItem(key);
    } catch {
      // No localStorage — best-effort.
    }
  },
};
