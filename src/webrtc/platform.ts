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
