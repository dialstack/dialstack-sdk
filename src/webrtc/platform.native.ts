/**
 * Platform seam (React Native) — resolved by Metro instead of `platform.ts`
 * when the call/signaling core is bundled for native. Same exported surface as
 * `platform.ts`, backed by `react-native-webrtc` + `react-native-incall-manager`.
 *
 * Why this file exists — most browser primitives the core would otherwise reach
 * for DO NOT exist on React Native. Checklist of every web touchpoint and its
 * RN replacement:
 *
 *   RTCPeerConnection / MediaStream / getUserMedia  → react-native-webrtc        ✓
 *   AudioContext (WebAudio ringback)                → NOT on RN → InCallManager   ✓
 *   localStorage                                    → NOT on RN → host-injected store
 *                                                     (the SDK takes no persistence
 *                                                     dependency of its own; the RN
 *                                                     softphone provider requires the
 *                                                     app to supply `storage`, e.g. an
 *                                                     MMKV- or AsyncStorage-backed
 *                                                     adapter). The default below is a
 *                                                     non-persisting in-memory store,
 *                                                     used only if the core is driven
 *                                                     without a provider-supplied one.
 *   WebSocket (transport.ts)                        → global exists on RN, untouched
 *   fetch (phone.ts)                                → global exists on RN
 *   RTCRtpSender.dtmf / insertDTMF                  → NOT on RN (no RTCDTMFSender in
 *                                                     react-native-webrtc 124.x) → the
 *                                                     sender's `.dtmf` is undefined, so
 *                                                     Call.canSendDtmf is false and the
 *                                                     softphone hides the in-call keypad
 *                                                     (Call.sendDtmf still throws if called)
 *   <audio autoplay> element                        → NOT on RN; RN auto-routes remote
 *                                                     audio once the track is on the PC
 *
 * These peer dependencies are NEVER hard dependencies of the SDK — the web
 * build must not resolve this file. It is excluded from the SDK's `tsc`/rollup
 * builds (`*.native.ts` in tsconfig `exclude`) and is only compiled by the
 * consuming React Native app's Metro bundler.
 */

import InCallManager from 'react-native-incall-manager';
import {
  MediaStream as RNMediaStream,
  MediaStreamTrack as RNMediaStreamTrack,
  RTCPeerConnection as RNPeerConnection,
  mediaDevices,
} from 'react-native-webrtc';

// --- WebRTC types ----------------------------------------------------------
// Instance types come from react-native-webrtc's classes; the structural
// init/config types are declared here so the core needn't depend on the
// library's exact type-export names (it uses them structurally, and the RN API
// is shape-compatible with the browser WebRTC API).
export type RTCPeerConnection = InstanceType<typeof RNPeerConnection>;
export type MediaStream = InstanceType<typeof RNMediaStream>;
export type MediaStreamTrack = InstanceType<typeof RNMediaStreamTrack>;

export interface RTCIceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}
export interface RTCSessionDescriptionInit {
  type: 'offer' | 'answer' | 'pranswer' | 'rollback';
  sdp?: string;
}
export interface RTCIceCandidateInit {
  candidate?: string;
  sdpMid?: string | null;
  sdpMLineIndex?: number | null;
  usernameFragment?: string | null;
}
export interface RTCDTMFSender {
  insertDTMF(tones: string, duration?: number, interToneGap?: number): void;
}
export interface MediaStreamConstraints {
  audio?: boolean | Record<string, unknown>;
  video?: boolean | Record<string, unknown>;
}

// --- WebRTC primitives -----------------------------------------------------

export function createPeerConnection(iceServers: RTCIceServer[]): RTCPeerConnection {
  return new RNPeerConnection({ iceServers }) as unknown as RTCPeerConnection;
}

export function createMediaStream(): MediaStream {
  // react-native-webrtc accepts an array of initial tracks; the core adds the
  // mic track later via addTrack, so start empty.
  return new RNMediaStream([]) as unknown as MediaStream;
}

export function getUserMedia(constraints: MediaStreamConstraints): Promise<MediaStream> {
  return mediaDevices.getUserMedia(constraints) as unknown as Promise<MediaStream>;
}

/**
 * Outbound ringback for native. WebAudio's AudioContext doesn't exist on RN, so
 * the synthetic tone is produced by react-native-incall-manager instead. Every
 * call is guarded so a missing/older InCallManager degrades to a silent no-op
 * rather than throwing — the caller (call.ts) never guards the call site.
 */
export class Ringback {
  private playing = false;

  get isPlaying(): boolean {
    return this.playing;
  }

  start(): void {
    if (this.playing) return;
    try {
      InCallManager.startRingback('_DTMF_');
      this.playing = true;
    } catch {
      // No InCallManager / unsupported — ringback is best-effort.
    }
  }

  stop(): void {
    if (!this.playing) return;
    this.playing = false;
    try {
      InCallManager.stopRingback();
    } catch {
      // Best-effort.
    }
  }
}

// --- Persistence -----------------------------------------------------------
// The SDK takes NO persistence dependency on React Native. There is no single
// safe default: react-native-mmkv splits across major versions (v3/v4 require
// the New Architecture; the constructor changed `new MMKV()` → `createMMKV()`;
// `.delete` → `.remove`), and AsyncStorage is async where the core reads sync —
// so the SDK cannot pick one for every app. Instead the host injects a
// `PlatformStorage` adapter via `PhoneOptions.storage` (the React Native
// softphone provider requires it), pinning whichever store + version fits their
// app. See the example apps for MMKV- and AsyncStorage-backed reference adapters.
//
// The store below is a fallback that is never meant to be reached: the React
// Native softphone provider REQUIRES the host to pass `storage`, so a real app
// always injects one (even a trivial in-memory adapter is theirs to pass). It is
// only hit if the core is driven directly without a store — so rather than
// silently swallow the E911 id into a map that vanishes on restart, it throws to
// surface the missing wiring. There is deliberately no default persistence.

export interface PlatformStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const NO_STORAGE =
  'No storage was provided to the DialStack softphone. Pass a `storage` adapter ' +
  'to <SoftphoneProvider> (or PhoneOptions.storage) — e.g. an MMKV- or ' +
  'AsyncStorage-backed PlatformStorage. See the example apps for reference adapters.';

export const storage: PlatformStorage = {
  getItem() {
    throw new Error(NO_STORAGE);
  },
  setItem() {
    throw new Error(NO_STORAGE);
  },
  removeItem() {
    throw new Error(NO_STORAGE);
  },
};
