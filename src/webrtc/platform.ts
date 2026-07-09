/**
 * Platform seam (web) — the ~5 browser primitives the call/signaling core needs,
 * isolated behind a small module so the same `call.ts` / `phone.ts` logic runs
 * unchanged on React Native (resolved there via `platform.native.ts`).
 *
 * The factory functions read the relevant global *lazily* (at call time, not at
 * module load) so a test harness that swaps `globalThis.RTCPeerConnection` /
 * `MediaStream` / `navigator` in a `beforeEach` still takes effect — capturing
 * the constructors in module-scope `const`s would bind whatever existed when
 * this module was first imported (often `undefined` under jsdom).
 *
 * WebRTC TYPES are re-exported here too, so the core imports them from
 * `./platform` rather than depending on the ambient `lib.dom.d.ts` types
 * directly — on web they alias the DOM lib; on native they alias
 * `react-native-webrtc`'s (API-shape-compatible) equivalents.
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

/**
 * Synthetic ringback. On web this is the WebAudio `RingbackTone`; on native it
 * is backed by the platform in-call manager. Both are no-ops when their audio
 * backend is unavailable, so callers never have to guard the call site.
 */
export { RingbackTone as Ringback } from './ringback';

// --- Persistence shim ------------------------------------------------------

/**
 * Synchronous key/value persistence for the E911 address id. Web is backed by
 * `localStorage`; native by an in-memory cache that hydrates from / writes
 * through to AsyncStorage. Guarded so the core works in non-browser hosts
 * (Node/tests) where `localStorage` is absent — there, persistence is a no-op
 * and the app supplies `PhoneOptions.emergencyAddressId` itself.
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
