import { PhoneError } from './errors';
import { Ringback, createMediaStream, createPeerConnection, getUserMedia } from './platform';
import type {
  MediaStream,
  RTCDTMFSender,
  RTCIceCandidateInit,
  RTCIceServer,
  RTCPeerConnection,
  RTCSessionDescriptionInit,
} from './platform';
import type { Transport } from './transport';
import type {
  CallDirection,
  CallEndReason,
  CallState,
  HeldBy,
  RejectReason,
  ServerMessage,
} from './types';

type CallEventMap = {
  trying: () => void;
  ringing: () => void;
  answered: () => void;
  held: (by: HeldBy) => void;
  resumed: () => void;
  ended: (reason: CallEndReason) => void;
};

type Listener<K extends keyof CallEventMap> = CallEventMap[K];

export interface CallInit {
  id: string;
  direction: CallDirection;
  from: string;
  fromName: string | null;
  to: string;
  initialState: CallState;
  transport: Transport;
  iceServers: RTCIceServer[];
  // Phone-owned hook that dials the consult leg of an attended transfer
  // (the Call can't construct sibling Calls itself — registration, ICE
  // servers, and pending-call resolution live on DialStackPhone).
  startConsult: (parent: Call, destination: string) => Promise<Call>;
}

export class Call {
  // Mutable so phone.ts can swap the client-generated id for the
  // server-assigned call_id when call.trying arrives.
  id: string;
  readonly direction: CallDirection;
  readonly from: string;
  readonly fromName: string | null;
  readonly to: string;
  state: CallState;
  isMuted = false;
  duration = 0;
  readonly peerConnection: RTCPeerConnection;

  get isHeld(): boolean {
    return this.state === 'held';
  }

  /**
   * Whether DTMF can be sent on this call. False on platforms whose WebRTC
   * senders expose no `.dtmf` (react-native-webrtc has no RTCDTMFSender), which
   * is why the softphone UI gates its in-call keypad on this. Only meaningful
   * once the call is active — the sender is attached during answer/offer
   * negotiation (attachDtmfSender). `sendDtmf()` still throws if called anyway.
   */
  get canSendDtmf(): boolean {
    return this.dtmfSender !== null;
  }

  private transport: Transport;
  private readonly startConsult: (parent: Call, destination: string) => Promise<Call>;
  private localStream: MediaStream;
  private remoteStream: MediaStream;
  private dtmfSender: RTCDTMFSender | null = null;
  private durationTimer: ReturnType<typeof setInterval> | null = null;
  private answeredAt: number | null = null;
  private listeners: { [K in keyof CallEventMap]?: Set<Listener<K>> } = {};
  private endedSettled = false;
  private pendingAnswerSdp: string | null = null;
  private answerSent = false;
  // Set when answer() is called before the answer SDP is ready (offer still
  // arriving, mic-permission prompt open, or ICE still gathering). The answer
  // is then sent automatically from prepareAnswerForOffer once ready, rather
  // than answer() throwing on an eager first click.
  private wantsAnswer = false;
  // Resolves once the mic tracks are attached to localStream. The Call
  // acquires the mic itself (rather than the caller awaiting getUserMedia
  // before construction) so phone.ts can register the Call synchronously on
  // call.incoming — otherwise the sdp.offer/ICE that arrive while the mic
  // permission prompt is open would hit getCall() → undefined and be dropped.
  private readonly localMediaReady: Promise<void>;
  // Remote ICE candidates that arrive before the remote description is set
  // (e.g. an ice.candidate processed before prepareAnswerForOffer's
  // setRemoteDescription resolves) — applied once the description is in place.
  private pendingRemoteCandidates: RTCIceCandidateInit[] = [];
  private remoteDescriptionSet = false;
  private readonly ringback = new Ringback();
  // Suppression keys on REAL received audio, not SDP negotiation. A remote track
  // arriving (or an sdp.pranswer being applied) only means early media was
  // negotiated — the carrier may negotiate it and never send a packet, which
  // would leave the caller with dead air during alerting. So we keep ringing
  // until the remote audio track actually unmutes (RTP starts flowing); a brief
  // tone/early-media overlap is preferable to silence.
  private remoteAudioFlowing = false;

  constructor(init: CallInit) {
    this.id = init.id;
    this.direction = init.direction;
    this.from = init.from;
    this.fromName = init.fromName;
    this.to = init.to;
    this.state = init.initialState;
    this.transport = init.transport;
    this.startConsult = init.startConsult;
    this.localStream = createMediaStream();
    this.remoteStream = createMediaStream();

    this.peerConnection = createPeerConnection(init.iceServers);
    this.wirePeerConnection();
    this.localMediaReady = this.acquireLocalMedia();
  }

  // whenLocalMediaReady lets the owner (phone.ts) surface a mic-permission
  // failure for an inbound call without having awaited getUserMedia before the
  // Call existed.
  whenLocalMediaReady(): Promise<void> {
    return this.localMediaReady;
  }

  private async acquireLocalMedia(): Promise<void> {
    const stream = await getUserMedia({ audio: true });
    stream.getTracks().forEach((t) => this.localStream.addTrack(t));
  }

  on<K extends keyof CallEventMap>(event: K, handler: Listener<K>): void {
    let set = this.listeners[event] as Set<Listener<K>> | undefined;
    if (!set) {
      set = new Set<Listener<K>>();
      (this.listeners as Record<string, Set<Listener<K>>>)[event] = set;
    }
    set.add(handler);
  }

  off<K extends keyof CallEventMap>(event: K, handler?: Listener<K>): void {
    if (!handler) {
      delete this.listeners[event];
      return;
    }
    (this.listeners[event] as Set<Listener<K>> | undefined)?.delete(handler);
  }

  answer(): void {
    if (this.direction !== 'inbound') {
      throw new PhoneError({
        code: 'invalid_message',
        message: 'Only inbound calls can be answered',
        callId: this.id,
      });
    }
    if (this.answerSent) return;
    // If the answer SDP isn't ready yet (the offer is still arriving, the mic
    // prompt is open, or ICE is still gathering), don't throw — record the
    // intent and let prepareAnswerForOffer send the answer the moment it's
    // ready. This makes an eager first click "just work".
    if (this.pendingAnswerSdp) {
      this.sendAnswer();
    } else {
      this.wantsAnswer = true;
    }
  }

  // Sends the buffered answer SDP. Idempotent; no-ops if already answered, the
  // call has ended, or the answer SDP isn't ready. Called from answer() (when
  // ready) and from prepareAnswerForOffer() (to flush a deferred answer).
  private sendAnswer(): void {
    if (this.answerSent || this.state === 'ended' || !this.pendingAnswerSdp) return;
    this.transport.send({ type: 'call.answer', call_id: this.id });
    this.transport.send({ type: 'sdp.answer', call_id: this.id, sdp: this.pendingAnswerSdp });
    this.answerSent = true;
  }

  reject(reason: RejectReason = 'decline'): void {
    this.transport.send({ type: 'call.reject', call_id: this.id, reason });
  }

  hangup(): void {
    if (this.endedSettled) return;
    this.transport.send({ type: 'call.hangup', call_id: this.id });
  }

  hold(): void {
    this.transport.send({ type: 'call.hold', call_id: this.id });
  }

  resume(): void {
    this.transport.send({ type: 'call.resume', call_id: this.id });
  }

  mute(): void {
    this.transport.send({ type: 'call.mute', call_id: this.id });
    this.localStream.getAudioTracks().forEach((t) => (t.enabled = false));
    this.isMuted = true;
  }

  unmute(): void {
    this.transport.send({ type: 'call.unmute', call_id: this.id });
    this.localStream.getAudioTracks().forEach((t) => (t.enabled = true));
    this.isMuted = false;
  }

  sendDtmf(digits: string, duration = 100, interToneGap = 70): void {
    if (!this.dtmfSender) {
      throw new PhoneError({
        code: 'call_failed',
        message: 'DTMF sender not available',
        callId: this.id,
      });
    }
    this.dtmfSender.insertDTMF(digits, duration, interToneGap);
  }

  /**
   * Blind transfer: immediately redirect the remote party to `destination`.
   * Fire-and-forget — on success the call ends with reason 'transferred';
   * on failure a non-fatal error is emitted and the call stays active.
   * The call must be active.
   */
  transfer(destination: string): void {
    this.assertTransferable();
    this.transport.send({ type: 'call.transfer', call_id: this.id, destination });
  }

  /**
   * Attended (consultative) transfer, step 1: hold this call and dial
   * `destination` as a consult leg. Resolves with the consult Call. Once the
   * consult party answers, call `completeTransfer()` on THIS call to bridge
   * them; or hang up the consult and `resume()` to abandon the transfer.
   */
  attendedTransfer(destination: string): Promise<Call> {
    this.assertTransferable();
    return this.startConsult(this, destination);
  }

  /**
   * Attended transfer, step 2: bridge the remote party to the consult leg's
   * party. Valid once the consult call (started via `attendedTransfer`) is
   * answered; this call is held at that point. On success both calls end
   * with reason 'transferred'.
   */
  completeTransfer(): void {
    if (this.state !== 'held') {
      throw new PhoneError({
        code: 'invalid_message',
        message: 'completeTransfer requires a held call with an active consult leg',
        callId: this.id,
      });
    }
    this.transport.send({ type: 'call.transfer.attended', call_id: this.id, step: 'complete' });
  }

  private assertTransferable(): void {
    // A transfer needs a live, connected call. A held call is still connected —
    // hold is a media modifier (sendonly), not a different call — and the server
    // keeps it StateActive and re-asserts hold idempotently as step 1 of the
    // attended flow. So both 'active' and 'held' are transferable; only reject
    // the not-yet-connected ('trying'/'ringing') and gone ('ended') states.
    if (this.state !== 'active' && this.state !== 'held') {
      throw new PhoneError({
        code: 'invalid_message',
        message: 'Only a connected call can be transferred',
        callId: this.id,
      });
    }
  }

  get remoteMediaStream(): MediaStream {
    return this.remoteStream;
  }

  async startOutbound(): Promise<RTCSessionDescriptionInit> {
    await this.localMediaReady;
    this.localStream.getTracks().forEach((t) => this.peerConnection.addTrack(t, this.localStream));
    this.attachDtmfSender();
    const offer = await this.peerConnection.createOffer();
    await this.peerConnection.setLocalDescription(offer);
    // Send a non-trickle (vanilla) offer: wait for ICE gathering to finish so
    // the SDP carries a=candidate lines before handing it to the signalling
    // layer. The service expects ICE candidates embedded in the offer SDP;
    // candidates sent separately (trickle) are not negotiated into the session,
    // so a candidate-less offer yields an answer with no ICE and media never
    // connects.
    await this.waitForIceGatheringComplete();
    return this.localDescriptionOr(offer);
  }

  async prepareAnswerForOffer(sdp: string): Promise<void> {
    // Set the remote description first (no mic needed) so any ICE candidates
    // buffered while the mic prompt was open can be applied, then wait for the
    // local mic before building the answer — the offer may have arrived while
    // getUserMedia was still pending.
    await this.peerConnection.setRemoteDescription({ type: 'offer', sdp });
    this.remoteDescriptionSet = true;
    await this.flushPendingRemoteCandidates();
    try {
      await this.localMediaReady;
    } catch {
      // Mic acquisition failed. handleIncoming already surfaces this via
      // whenLocalMediaReady().catch, so abort answer preparation here without
      // rejecting — otherwise the owner would emit a duplicate 'error' for the
      // same denial.
      return;
    }
    // setRemoteDescription(offer) above already created a track-less sender for
    // each offered m-line, so getSenders() is non-empty here even though no mic
    // is attached yet. Guard on whether a sender actually has a track — keying
    // off getSenders().length would skip addTrack and yield an a=recvonly answer
    // (browser receives but never sends, i.e. one-way "no audio to the far end").
    // addTrack reuses the existing track-less transceiver and flips it to sendrecv.
    if (!this.peerConnection.getSenders().some((s) => s.track)) {
      this.localStream
        .getTracks()
        .forEach((t) => this.peerConnection.addTrack(t, this.localStream));
    }
    this.attachDtmfSender();
    const answer = await this.peerConnection.createAnswer();
    await this.peerConnection.setLocalDescription(answer);
    // Same non-trickle requirement as startOutbound: gather candidates into the
    // answer SDP before sending it, otherwise the negotiated session has no ICE.
    await this.waitForIceGatheringComplete();
    this.pendingAnswerSdp = this.peerConnection.localDescription?.sdp ?? answer.sdp ?? null;
    // Flush a deferred answer: answer() may have been clicked before the SDP
    // was ready, in which case it set wantsAnswer instead of sending.
    if (this.wantsAnswer) this.sendAnswer();
  }

  // Applies network early media (the carrier's 183 SDP) as a JSEP provisional
  // answer so RTP can play before answer; acceptRemoteAnswer replaces it at
  // pickup. The server may forward several pranswers; the browser's operations
  // chain (WebRTC 1.0 §4.4.1) serializes the setRemoteDescription calls FIFO and
  // the WS handler dispatches them in arrival order, so they apply in order
  // without overlapping. Setting remoteDescriptionSet lets buffered ICE flow.
  async acceptRemoteProvisionalAnswer(sdp: string): Promise<void> {
    await this.peerConnection.setRemoteDescription({ type: 'pranswer', sdp });
    this.remoteDescriptionSet = true;
    await this.flushPendingRemoteCandidates();
  }

  async acceptRemoteAnswer(sdp: string): Promise<void> {
    await this.peerConnection.setRemoteDescription({ type: 'answer', sdp });
    this.remoteDescriptionSet = true;
    await this.flushPendingRemoteCandidates();
  }

  async addRemoteCandidate(
    candidate: string,
    sdpMid: string | null,
    sdpMLineIndex: number | null
  ): Promise<void> {
    const init: RTCIceCandidateInit =
      candidate == null
        ? (null as unknown as RTCIceCandidateInit)
        : { candidate, sdpMid: sdpMid ?? undefined, sdpMLineIndex: sdpMLineIndex ?? undefined };
    // addIceCandidate throws if the remote description isn't set yet. The server
    // sends sdp.offer/answer just before ICE, but those are processed
    // asynchronously, so a candidate can land first — buffer until the
    // description is in place (flushed by prepare/acceptRemote*).
    if (!this.remoteDescriptionSet) {
      this.pendingRemoteCandidates.push(init);
      return;
    }
    await this.peerConnection.addIceCandidate(init);
  }

  private async flushPendingRemoteCandidates(): Promise<void> {
    const pending = this.pendingRemoteCandidates;
    this.pendingRemoteCandidates = [];
    for (const init of pending) {
      await this.peerConnection.addIceCandidate(init);
    }
  }

  handleServerMessage(msg: ServerMessage): void {
    switch (msg.type) {
      case 'call.trying':
        this.state = 'trying';
        this.emit('trying');
        return;
      case 'call.ringing':
        this.state = 'ringing';
        // call.ringing fires on alerting (SIP 180). Play local ringback only for
        // an outbound call still in its pre-answer ringing phase with no real
        // remote media: a late/rogue 180 after answer or end must not restart the
        // tone, and network early media (provisional answer / live remote track)
        // suppresses it since the forwarded media is what's audible.
        if (
          this.direction === 'outbound' &&
          this.answeredAt === null &&
          !this.endedSettled &&
          !this.remoteAudioFlowing
        ) {
          this.ringback.start();
        }
        this.emit('ringing');
        return;
      case 'call.answered':
        this.state = 'active';
        this.answeredAt = Date.now();
        this.ringback.stop();
        this.startDurationTimer();
        this.emit('answered');
        return;
      case 'call.held':
        this.state = 'held';
        this.emit('held', msg.held_by);
        return;
      case 'call.resumed':
        this.state = 'active';
        this.emit('resumed');
        return;
      case 'call.ended':
        this.settleEnded(msg.reason);
        return;
      default:
        return;
    }
  }

  dispose(): void {
    this.ringback.stop();
    this.stopDurationTimer();
    this.releaseMedia();
  }

  private settleEnded(reason: CallEndReason): void {
    if (this.endedSettled) return;
    this.endedSettled = true;
    this.state = 'ended';
    this.ringback.stop();
    this.stopDurationTimer();
    this.releaseMedia();
    this.emit('ended', reason);
  }

  // Stop the captured mic tracks and close the peer connection. Without
  // stopping the local tracks, the browser's mic-active indicator stays
  // lit after the call ends and the MediaStreamTrack handles leak until
  // the page is unloaded.
  private releaseMedia(): void {
    try {
      this.peerConnection.close();
    } catch {
      // Ignore: peer connection may already be closed.
    }
    this.localStream.getTracks().forEach((t) => {
      try {
        t.stop();
      } catch {
        // Ignore: track may already be stopped.
      }
    });
  }

  // Marks real audio as flowing and stops any synthetic ringback. Driven by the
  // remote track's `unmute` (RTP actually started), never by track arrival.
  private onRemoteAudioFlowing(): void {
    this.remoteAudioFlowing = true;
    this.ringback.stop();
  }

  private wirePeerConnection(): void {
    this.peerConnection.addEventListener('track', (evt) => {
      evt.streams[0]?.getTracks().forEach((t) => {
        if (!this.remoteStream.getTracks().includes(t)) this.remoteStream.addTrack(t);
      });
      // Stop the synthetic tone only when real audio is actually received: the
      // remote audio track's `unmute` (RTP started), not its arrival (which is
      // SDP-negotiation time). An already-unmuted track means media is flowing
      // now. Keying on negotiation would cut the tone to dead air when a carrier
      // negotiates early media but sends no packets.
      const track = evt.track;
      if (track?.kind !== 'audio') return;
      if (track.muted === false) {
        this.onRemoteAudioFlowing();
      } else {
        track.addEventListener('unmute', () => this.onRemoteAudioFlowing(), { once: true });
      }
    });

    this.peerConnection.addEventListener('icecandidate', (evt) => {
      // ICE candidates fire asynchronously from the peer connection and can
      // arrive while the socket is mid-reconnect or closed. Use best-effort
      // trySend so a late candidate doesn't throw an uncaught PhoneError into
      // this handler (trickle ICE tolerates loss; a closed socket means the
      // call is already tearing down).
      if (evt.candidate) {
        this.transport.trySend({
          type: 'ice.candidate',
          call_id: this.id,
          candidate: evt.candidate.candidate,
          sdp_mid: evt.candidate.sdpMid ?? null,
          sdp_m_line_index: evt.candidate.sdpMLineIndex ?? null,
        });
      } else {
        this.transport.trySend({ type: 'ice.done', call_id: this.id });
      }
    });
  }

  // Resolve once ICE gathering reaches 'complete', or after a timeout so a
  // slow/unreachable STUN/TURN server can't stall call setup — host candidates
  // (gathered near-instantly) are enough for the SDP to be ICE-valid, and any
  // server-reflexive candidates that arrive later are a bonus we don't block on.
  private waitForIceGatheringComplete(timeoutMs = 2000): Promise<void> {
    if (this.peerConnection.iceGatheringState === 'complete') return Promise.resolve();
    return new Promise<void>((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        this.peerConnection.removeEventListener('icegatheringstatechange', onChange);
        resolve();
      };
      const onChange = () => {
        if (this.peerConnection.iceGatheringState === 'complete') finish();
      };
      const timer = setTimeout(finish, timeoutMs);
      this.peerConnection.addEventListener('icegatheringstatechange', onChange);
    });
  }

  // localDescription holds the gathered candidates after waitForIceGatheringComplete;
  // fall back to the pre-gathering description if the browser hasn't populated it.
  private localDescriptionOr(fallback: RTCSessionDescriptionInit): RTCSessionDescriptionInit {
    const local = this.peerConnection.localDescription;
    return local ? { type: local.type, sdp: local.sdp } : fallback;
  }

  private attachDtmfSender(): void {
    const sender = this.peerConnection.getSenders().find((s) => s.track?.kind === 'audio');
    this.dtmfSender = sender?.dtmf ?? null;
  }

  private startDurationTimer(): void {
    this.stopDurationTimer();
    this.durationTimer = setInterval(() => {
      if (this.answeredAt) this.duration = Math.floor((Date.now() - this.answeredAt) / 1000);
    }, 1000);
  }

  private stopDurationTimer(): void {
    if (this.durationTimer) {
      clearInterval(this.durationTimer);
      this.durationTimer = null;
    }
  }

  private emit<K extends keyof CallEventMap>(event: K, ...args: Parameters<CallEventMap[K]>): void {
    this.listeners[event]?.forEach((h) => {
      (h as (...a: unknown[]) => void)(...(args as unknown[]));
    });
  }
}
