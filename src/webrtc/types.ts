export type CallState = 'trying' | 'ringing' | 'active' | 'held' | 'ended';
export type CallDirection = 'inbound' | 'outbound';
export type CallEndReason = 'hangup' | 'no-answer' | 'busy' | 'failed' | 'transferred' | 'rejected';
export type RejectReason = 'busy' | 'decline';
export type HeldBy = 'local' | 'remote';
export type PresenceStatus = 'available' | 'on_call' | 'dnd' | 'away' | 'offline';
export type SettablePresenceStatus = 'available' | 'dnd' | 'away';

export interface PhoneOptions {
  token: string;
  apiBaseUrl?: string;
  onTokenExpiring?: () => Promise<string>;
  autoReconnect?: boolean;
  iceServers?: RTCIceServer[];
}

export interface CallOptions {
  // Reserved for future use; caller-ID is currently fixed at the
  // billing layer (see webrtc CallCreateMessage doc comment).
  _reserved?: never;
}

export interface PresenceEntry {
  userId: string;
  name: string;
  status: PresenceStatus;
  statusText: string | null;
  updatedAt: string;
}

export interface PresenceUpdate {
  userId: string;
  status: PresenceStatus;
  statusText: string | null;
  updatedAt: string;
}

export interface IceServersResponse {
  ice_servers: RTCIceServer[];
  expires_at: string;
}

export type ClientMessage =
  | { type: 'authenticate'; token: string }
  | { type: 'call.create'; destination: string; sdp: string; client_call_id?: string }
  | { type: 'call.answer'; call_id: string }
  | { type: 'call.reject'; call_id: string; reason?: RejectReason }
  | { type: 'call.hangup'; call_id: string }
  | { type: 'call.hold'; call_id: string }
  | { type: 'call.resume'; call_id: string }
  | { type: 'call.mute'; call_id: string }
  | { type: 'call.unmute'; call_id: string }
  | { type: 'sdp.offer'; call_id: string; sdp: string }
  | { type: 'sdp.answer'; call_id: string; sdp: string }
  | {
      type: 'ice.candidate';
      call_id: string;
      candidate: string;
      sdp_mid: string | null;
      sdp_m_line_index: number | null;
    }
  | { type: 'ice.done'; call_id: string };

export type ServerMessage =
  | { type: 'authenticated'; user_id: string; account_id: string; reconnected?: boolean }
  | { type: 'error'; code: string; message: string; call_id?: string | null; fatal?: boolean }
  | { type: 'call.trying'; call_id: string; client_call_id?: string | null }
  | { type: 'call.ringing'; call_id: string }
  | { type: 'call.incoming'; call_id: string; from: string; from_name: string | null; to: string }
  | { type: 'call.answered'; call_id: string; answered_at?: string }
  | { type: 'call.ended'; call_id: string; reason: CallEndReason; duration_seconds: number | null }
  | {
      type: 'call.restored';
      call_id: string;
      state: 'ringing' | 'active' | 'held';
      from: string;
      from_name: string | null;
      to: string;
      direction: CallDirection;
      answered_at: string | null;
    }
  | { type: 'call.held'; call_id: string; held_by: HeldBy }
  | { type: 'call.resumed'; call_id: string }
  | { type: 'sdp.offer'; call_id: string; sdp: string }
  | { type: 'sdp.answer'; call_id: string; sdp: string }
  | {
      type: 'ice.candidate';
      call_id: string;
      candidate: string;
      sdp_mid: string | null;
      sdp_m_line_index: number | null;
    }
  | { type: 'ice.done'; call_id: string };
