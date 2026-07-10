/**
 * Platform seam (React Native) — resolved by Metro instead of `platform.ts`
 * when the call/signaling core is bundled for native. Same exported surface as
 * `platform.ts`, backed by `react-native-webrtc` + `react-native-incall-manager`
 * + AsyncStorage.
 *
 * Why this file exists — most browser primitives the core would otherwise reach
 * for DO NOT exist on React Native. Checklist of every web touchpoint and its
 * RN replacement:
 *
 *   RTCPeerConnection / MediaStream / getUserMedia  → react-native-webrtc        ✓
 *   AudioContext (WebAudio ringback)                → NOT on RN → InCallManager   ✓
 *   localStorage                                    → NOT on RN → AsyncStorage    ✓
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

import AsyncStorage from '@react-native-async-storage/async-storage';
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

// --- Persistence shim ------------------------------------------------------
// AsyncStorage is async, but the core reads the persisted E911 id synchronously
// in the DialStackPhone constructor. Bridge the two with a synchronous in-memory
// cache that hydrates from AsyncStorage at module load (fire-and-forget) and
// writes through on every set. On a cold first launch the value may not be
// hydrated in time for the very first synchronous read — which is fine: on
// native the address id is normally supplied via PhoneOptions.emergencyAddressId,
// and persistence is a best-effort convenience for subsequent launches.

export interface PlatformStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const STORAGE_NAMESPACE = 'dialstack.webrtc.';
const cache = new Map<string, string>();
// Keys written locally (set/remove) since module load. Async hydration must not
// stomp a value the app has already written: if setItem/removeItem lands before
// the multiGet resolves, the disk value it read is stale for that key.
const dirtyKeys = new Set<string>();

void (async () => {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const ours = keys.filter((k: string) => k.startsWith(STORAGE_NAMESPACE));
    if (ours.length === 0) return;
    const entries = await AsyncStorage.multiGet(ours);
    for (const [key, value] of entries) {
      if (value != null && !dirtyKeys.has(key)) cache.set(key, value);
    }
  } catch {
    // Best-effort hydration.
  }
})();

export const storage: PlatformStorage = {
  getItem(key) {
    return cache.get(key) ?? null;
  },
  setItem(key, value) {
    dirtyKeys.add(key);
    cache.set(key, value);
    void AsyncStorage.setItem(key, value).catch(() => undefined);
  },
  removeItem(key) {
    dirtyKeys.add(key);
    cache.delete(key);
    void AsyncStorage.removeItem(key).catch(() => undefined);
  },
};
