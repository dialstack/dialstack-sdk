import { devicePhoneError, isRetryableWithoutDevice, PhoneError } from './errors.js';
import { logWarn } from './logger.js';
import {
  createMediaStream,
  createPeerConnection,
  getUserMedia,
  supportsPranswer,
  type MediaStream,
  type MediaStreamConstraints,
  type MediaStreamTrack,
  type RTCDTMFSender,
  type RTCIceCandidateInit,
  type RTCIceServer,
  type RTCPeerConnection,
  type RTCSessionDescriptionInit,
} from './platform.js';
import { RingbackTone, type Ringback } from './ringback.js';
import type { Transport } from './transport.js';
import type {
  CallDirection,
  CallEndReason,
  CallState,
  HeldBy,
  RejectReason,
  ServerMessage,
} from './types.js';

// Fires at most once per process: an audio sender with no `.dtmf` on React Native
// means the app installed a WebRTC package without the `RTCRtpSender.dtmf` bridge
// (DialStack's fork has it; LiveKit's and Stream's don't), so DTMF is
// unavailable. Guarded so it can't spam per call.
let warnedMissingDtmfBridge = false;
function warnMissingDtmfBridgeOnce(): void {
  if (warnedMissingDtmfBridge) return;
  warnedMissingDtmfBridge = true;
  logWarn(
    'DTMF is unavailable: the audio sender exposes no RTCDTMFSender. On React ' +
      "Native, install DialStack's react-native-webrtc fork (which adds " +
      'RTCRtpSender.dtmf) — see the @dialstack/sdk-native README.'
  );
}

// Always `exact` for a real request: Chrome's own device-picker preference overrides
// `ideal`, so a lenient constraint can silently capture a mic that was never asked for
// and leave the recorded preference naming a device that was never opened. Leniency
// belongs in the caller's fallback (acquireLocalMedia retries unconstrained), not here.
function audioConstraintsFor(deviceId: string | null): MediaStreamConstraints {
  if (!deviceId) return { audio: true };
  return { audio: { deviceId: { exact: deviceId } } };
}

function stopTrack(track: MediaStreamTrack): void {
  try {
    track.stop();
  } catch {
    // Some hosts throw on a second stop.
  }
}

// Fires at most once per process. Network early media (the carrier's pre-answer
// ringback/announcement) can't be rendered on a stack without JSEP pranswer
// support — Firefox, which has never implemented it (Mozilla bug 1004510). The
// call itself is unaffected; the caller hears local synthetic ringback instead of
// the carrier's audio, so this is a logged degradation, not a call failure.
let warnedPranswerUnsupported = false;
function warnPranswerUnsupportedOnce(): void {
  if (warnedPranswerUnsupported) return;
  warnedPranswerUnsupported = true;
  logWarn(
    'Network early media (carrier pre-answer audio) is unavailable: this browser ' +
      'does not implement JSEP provisional answers (setRemoteDescription with ' +
      "type:'pranswer') — known Firefox limitation, Mozilla bug 1004510. Calls " +
      'still connect normally and play local ringback while alerting.'
  );
}

type CallEventMap = {
  trying: () => void;
  ringing: () => void;
  answered: () => void;
  held: (by: HeldBy) => void;
  resumed: () => void;
  ended: (reason: CallEndReason) => void;
  audioInputChanged: (deviceId: string | null) => void;
  // The sender keeps a dead track, so the far end hears silence and nothing throws.
  audioInputLost: () => void;
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
  // Outbound ringback tone. Defaults to the WebAudio `RingbackTone`; React Native
  // supplies an InCallManager-backed one (WebAudio's `AudioContext` doesn't exist
  // there). Threaded from `PhoneOptions.ringback`.
  ringback?: Ringback;
  audioInputDeviceId?: string;
  audioOutputDeviceId?: string;
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
   * Whether the call is a live, connected conversation — answered and not ended.
   * Hold is a media modifier, not a separate lifecycle, so BOTH `active` and
   * `held` count as connected; `trying`/`ringing` (not yet up) and `ended` do
   * not. This is the single source of truth for "is this call
   * transferable / bridgeable / controllable" — every such gate (transfer,
   * completeTransfer, the in-call control row, isCallActive) reads it so the
   * rule can't drift between call sites.
   */
  get isConnected(): boolean {
    return this.state === 'active' || this.state === 'held';
  }

  /**
   * Whether DTMF can be sent on this call — the gate the softphone UI uses for
   * its in-call keypad. False when the audio sender exposes no `.dtmf` (e.g. a
   * connected call that never got a usable sender). Only meaningful once the
   * call is active — the sender is attached during answer/offer negotiation
   * (attachDtmfSender). `sendDtmf()` still throws if called anyway. Both web and
   * native go through the same sender: web via the browser RTCDTMFSender, native
   * via react-native-webrtc's `RTCRtpSender.dtmf` (provided by the DialStack fork).
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
  // Not readonly: a successful switch replaces a rejected one, or negotiation keeps
  // awaiting the original failure and never answers.
  private localMediaReady: Promise<void>;
  // Remote ICE candidates that arrive before the remote description is set
  // (e.g. an ice.candidate processed before prepareAnswerForOffer's
  // setRemoteDescription resolves) — applied once the description is in place.
  private pendingRemoteCandidates: RTCIceCandidateInit[] = [];
  private remoteDescriptionSet = false;
  // Rejecters for the in-flight waitForIceGatheringComplete promises, so teardown
  // can settle a wait that no ICE event will ever reach.
  private readonly gatheringAborts = new Set<() => void>();
  private readonly ringback: Ringback;
  // Suppression keys on REAL received audio, not SDP negotiation. A remote track
  // arriving (or an sdp.pranswer being applied) only means early media was
  // negotiated — the carrier may negotiate it and never send a packet, which
  // would leave the caller with dead air during alerting. So we keep ringing
  // until the remote audio track actually unmutes (RTP starts flowing); a brief
  // tone/early-media overlap is preferable to silence.
  private remoteAudioFlowing = false;
  private audioInputDeviceId_: string | null;
  // Serializes device switches: two overlapping switches would otherwise interleave
  // their acquire/replace/stop steps, and one could stop the track the other installed.
  private switchChain: Promise<void> = Promise.resolve();

  constructor(init: CallInit) {
    this.id = init.id;
    this.direction = init.direction;
    this.from = init.from;
    this.fromName = init.fromName;
    this.to = init.to;
    this.state = init.initialState;
    this.transport = init.transport;
    this.startConsult = init.startConsult;
    this.ringback = init.ringback ?? new RingbackTone();
    this.ringback.setSinkId?.(init.audioOutputDeviceId ?? null);
    this.localStream = createMediaStream();
    this.remoteStream = createMediaStream();
    this.audioInputDeviceId_ = init.audioInputDeviceId ?? null;

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
    const preferred = this.audioInputDeviceId_;
    let stream: MediaStream;
    try {
      stream = await getUserMedia(audioConstraintsFor(preferred));
    } catch (e) {
      // A saved id that no longer resolves must not fail the call — ids rotate per
      // origin and devices get unplugged between sessions — so retry unconstrained and
      // let the OS choose. Skipped for a permission denial (re-prompts, same answer)
      // and for a locked mic (no device of the kind is readable, so there is nothing
      // looser constraints could find).
      if (!preferred || !isRetryableWithoutDevice(e)) throw e;
      stream = await getUserMedia({ audio: true });
    }
    stream.getTracks().forEach((t) => {
      this.localStream.addTrack(t);
      this.watchCaptureTrack(t);
    });
  }

  /** The selected mic, or null for the OS default. */
  get audioInputDeviceId(): string | null {
    return this.audioInputDeviceId_;
  }

  /**
   * The device actually captured. May differ from `audioInputDeviceId` at acquisition,
   * where the constraint is `ideal` — how a caller detects a substitution.
   */
  get effectiveAudioInputDeviceId(): string | null {
    const [track] = this.localStream.getAudioTracks();
    return track?.getSettings?.().deviceId ?? null;
  }

  /** Internal — the phone-level setter broadcasts this to every live call. */
  async setAudioInputDevice(deviceId: string | null): Promise<void> {
    // The stored link swallows, so one failure can't poison the chain.
    const run = this.switchChain.then(
      () => this.switchAudioInput(deviceId),
      () => this.switchAudioInput(deviceId)
    );
    this.switchChain = run.catch(() => {});
    return run;
  }

  private async switchAudioInput(deviceId: string | null): Promise<void> {
    // Against what's CAPTURED and still live, never the recorded preference: `ideal`
    // acquisition can hand back a different device than was asked for, and a track that
    // ended keeps its deviceId — trusting the preference turned both the unplug-recovery
    // re-pick and that correction into no-ops that resolved without switching anything.
    const [capturedTrack] = this.localStream.getAudioTracks();
    const captured = this.effectiveAudioInputDeviceId;
    const capturedIsLive = capturedTrack?.readyState === 'live';
    if (deviceId !== null && deviceId === captured && capturedIsLive) return;
    // Don't also skip on non-null `captured`: the OS may hand back a specific device for
    // an unconstrained request, and the user must still be able to move off it.
    if (deviceId === null && this.audioInputDeviceId_ === null && captured === null) return;

    if (this.isFinished) {
      this.audioInputDeviceId_ = deviceId;
      return;
    }

    // A second getUserMedia while the prompt is open double-prompts on some browsers.
    let hadInitialMedia = true;
    try {
      await this.localMediaReady;
    } catch {
      hadInitialMedia = false;
    }
    if (this.isFinished) {
      this.audioInputDeviceId_ = deviceId;
      return;
    }

    let next: MediaStreamTrack;
    try {
      const stream = await getUserMedia(audioConstraintsFor(deviceId));
      const [track] = stream.getAudioTracks();
      if (!track) throw new Error('the acquired stream carried no audio track');
      next = track;
    } catch (e) {
      throw devicePhoneError({ cause: e, deviceId, callId: this.id });
    }

    // releaseMedia can't see this track; unstopped, the mic indicator stays lit.
    if (this.isFinished) {
      stopTrack(next);
      this.audioInputDeviceId_ = deviceId;
      return;
    }

    // A fresh track arrives enabled, so a muted call would start transmitting again.
    next.enabled = !this.isMuted;

    const sender = this.peerConnection.getSenders().find((s) => s.track?.kind === 'audio');
    const previous = this.localStream.getAudioTracks();
    let recoveredMedia = false;

    if (sender) {
      // replaceTrack changes only the sender's track, which is not an input to the
      // negotiation-needed check, so it can never ask for a renegotiation this client
      // couldn't service (it offers once per call and has no negotiationneeded
      // listener). A track the negotiated envelope can't carry — a different channel
      // count, say — rejects with InvalidModificationError instead, which is what the
      // catch below is for: the old track is still attached and sending at that point.
      try {
        await sender.replaceTrack(next);
      } catch (e) {
        stopTrack(next);
        throw new PhoneError({
          code: 'call_failed',
          message: `Could not switch microphone: ${(e as Error).message}`,
          callId: this.id,
        });
      }
    } else if (!hadInitialMedia) {
      // The original acquisition failed, so `localMediaReady` stays rejected and every
      // later await aborts — negotiation would never answer despite a working track.
      this.localMediaReady = Promise.resolve();
      recoveredMedia = true;
    }

    this.localStream.addTrack(next);
    this.watchCaptureTrack(next);
    previous.forEach((track) => {
      this.localStream.removeTrack(track);
      // Stop only after replaceTrack: an output-disabled sender sends no audio at all,
      // so stopping a track still attached to the sender would cut the stream rather
      // than mute it. Stopping is mandatory once detached, or the old device's mic
      // indicator stays lit for the rest of the call.
      stopTrack(track);
    });

    // Re-applied now that `next` is in localStream: a mute()/unmute() landing during the
    // replaceTrack await above mutated only the old track, and nothing else re-reads
    // isMuted, so the call would transmit against what the UI and server both believe.
    next.enabled = !this.isMuted;

    this.attachDtmfSender();

    this.audioInputDeviceId_ = deviceId;
    this.emit('audioInputChanged', deviceId);

    // An inbound call whose mic was denied has already consumed and discarded its offer
    // (the server sends sdp.offer right after call.incoming), so the recovered track has
    // no answer to ride out on. Rebuild one now.
    if (recoveredMedia && this.remoteDescriptionSet && !this.answerSent) {
      await this.buildAnswer();
    }
  }

  /** Route this call's ringback tone to `deviceId` (null = OS default). */
  setAudioOutputDevice(deviceId: string | null): void {
    this.ringback.setSinkId?.(deviceId);
  }

  // A capture track that ends on its own (device unplugged, OS revoked it) leaves the
  // sender attached to a dead track: the far end hears silence and nothing throws.
  private watchCaptureTrack(track: MediaStreamTrack): void {
    track.addEventListener?.('ended', () => {
      if (this.isFinished) return;
      // Only for a track that is still ours — a track we stopped during a switch
      // also fires 'ended', and reporting that would cry wolf on every switch.
      if (!this.localStream.getAudioTracks().includes(track)) return;
      this.emit('audioInputLost');
    });
  }

  // True once the call is over by either path: the server's call.ended (which sets
  // endedSettled) or a local dispose().
  private get isFinished(): boolean {
    return this.endedSettled || this.state === 'ended';
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
    // Only an active call can be held. A no-op otherwise (e.g. a still-ringing
    // outbound the multi-call layer auto-holds when the user answers a second
    // call) — sending call.hold for a non-active call draws a server
    // `invalid_message: call is not active` that surfaces as a spurious error.
    if (this.state !== 'active') return;
    this.transport.send({ type: 'call.hold', call_id: this.id });
  }

  resume(): void {
    // Symmetric to hold(): only a held call can be resumed.
    if (this.state !== 'held') return;
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
    // Called on the ORIGINAL leg (the server REFERs it to the consult, Replacing
    // the consult dialog). The original just has to be a live, connected call —
    // it's usually held (the consult is what you're talking to), but with
    // switchable focus the user may have switched TO the original, making it
    // active and the consult held. Either way the server keeps it StateActive and
    // the complete REFER is valid, so accept active OR held; only reject the
    // not-connected states.
    if (!this.isConnected) {
      throw new PhoneError({
        code: 'invalid_message',
        message: 'completeTransfer requires a connected call with an answered consult leg',
        callId: this.id,
      });
    }
    this.transport.send({ type: 'call.transfer.attended', call_id: this.id, step: 'complete' });
  }

  private assertTransferable(): void {
    // A transfer needs a live, connected call (active OR held — see isConnected).
    if (!this.isConnected) {
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
    // Half trickle (RFC 8838 § 16): wait for a usable candidate set rather than
    // a complete one. The offer must carry at least one a=candidate — a
    // candidate-less offer reads to the far end as "no ICE" and comes back with
    // an answer that has no ICE block, which the browser cannot apply.
    // Candidates gathered after this point are trickled separately and are
    // negotiated into the session where the path supports it.
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
    await this.buildAnswer();
  }

  // Builds (or rebuilds) the answer from an already-set remote description. Split
  // out of prepareAnswerForOffer so a mic acquired late — after a denial the user
  // recovered from — can still produce one: the server sends sdp.offer right after
  // call.incoming, so by then the offer has already been consumed and discarded.
  private async buildAnswer(): Promise<void> {
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
    // Same requirement as startOutbound: the answer must carry at least one
    // candidate, or the negotiated session has no ICE.
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
  //
  // Ordering precondition: the FIFO argument holds from the point
  // setRemoteDescription is ENQUEUED on the operations chain, and the
  // supportsPranswer() await below delays enqueueing by at least a microtask —
  // whereas acceptRemoteAnswer enqueues synchronously. That is safe only because
  // the probe has already settled by the time any 18x can arrive: connect() warms
  // it before the ICE fetch and the WS authenticate round trip, dialling is
  // refused until connected, and the probe is purely local. A settled promise
  // yields only microtasks, which drain between WS frames. If the probe ever
  // becomes slow or moves later than connect(), a pranswer could be enqueued
  // after a subsequent final answer — gate on a synchronously-readable verdict
  // instead of relying on this timing.
  //
  // Returns whether the provisional answer was applied. `false` means this stack
  // cannot do pranswer at all (Firefox — see supportsPranswer) and the frame was
  // skipped: the call is unaffected and proceeds to the final sdp.answer, it just
  // plays local synthetic ringback in place of whatever the carrier was sending
  // (see the trade-off note below — that audio is not always ringback). Skipping
  // must NOT touch remoteDescriptionSet — no remote description was applied, so
  // buffered ICE candidates have to keep waiting for the final answer, and
  // flushing them here would throw inside addIceCandidate.
  async acceptRemoteProvisionalAnswer(sdp: string): Promise<boolean> {
    if (!(await supportsPranswer())) {
      warnPranswerUnsupportedOnce();
      // Substitute local ringback for the carrier audio we can't render. Without
      // this a 183-only call (early media, no 180 — so no call.ringing ever fires;
      // see the outbound_early_media server test) would be dead air from dial to
      // pickup on a pranswer-less stack.
      //
      // Early media is NOT always ringback: a 183 can carry a SIT tone, a
      // "number you dialed is not in service" announcement, or a pre-answer IVR.
      // A pranswer-less stack can't render any of it, and SDP describes only
      // codec/direction — never the audio's meaning — so we cannot tell which
      // case this is. We therefore play ringback unconditionally, which means a
      // failure announcement is replaced by a ringing tone until the carrier
      // tears the call down. That is the accepted trade: dead air during
      // alerting reads as "the call broke" and is the worse failure, so ringing
      // when we shouldn't beats silence when we should — the same ordering the
      // local-ringback arbitration settled on.
      //
      // Same guards as the call.ringing path: an outbound call still pre-answer,
      // not ended, with no real remote audio.
      if (
        this.direction === 'outbound' &&
        this.answeredAt === null &&
        !this.endedSettled &&
        !this.remoteAudioFlowing
      ) {
        this.ringback.start();
      }
      return false;
    }
    await this.peerConnection.setRemoteDescription({ type: 'pranswer', sdp });
    this.remoteDescriptionSet = true;
    await this.flushPendingRemoteCandidates();
    return true;
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
    // Before releasing media: releaseMedia stops tracks without removing them, so the
    // `ended` handlers would report the device as lost during ordinary teardown.
    this.endedSettled = true;
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
    // Before close(), while ICE events can still be observed to have stopped:
    // a closed connection fires none, so a wait started here would never end.
    this.abortIceGathering();
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
  //
  // The timeout MUST NOT release a description with no candidates in it. That
  // is a well-formed trickle offer as far as the spec goes, but the far end
  // reads a candidate-less offer as "this peer does not do ICE" and answers
  // with no ICE block at all, at which point the browser cannot apply the
  // answer and no media is ever established. It looks intermittent because it
  // is a race against gathering: fast networks beat the cap, slow ones don't.
  // First seen on a React Native client, where gathering is slower than in a
  // browser and so loses the race more often.
  //
  // So the cap is a cap on waiting for a COMPLETE generation, not on waiting
  // for a usable one. If it fires with nothing gathered we keep waiting for the
  // first candidate — that is the half trickle of RFC 8838 § 16, and it is what
  // makes the offer safe against any peer, whether or not it supports trickle.
  // Waiting past the cap is only safe because two things can still end the wait
  // when no candidate ever arrives: the hard deadline below, and abortIceGathering()
  // on teardown. A closed peer connection fires no further ICE events, so without
  // those the promise would neither resolve nor reject and the caller's call()/
  // answer() would hang with no error to surface.
  private waitForIceGatheringComplete(timeoutMs = 2000, hardTimeoutMs = 15000): Promise<void> {
    if (this.peerConnection.iceGatheringState === 'complete') return Promise.resolve();
    return new Promise<void>((resolve, reject) => {
      let settled = false;
      const cleanup = () => {
        settled = true;
        clearTimeout(timer);
        clearTimeout(hardTimer);
        this.gatheringAborts.delete(abort);
        this.peerConnection.removeEventListener('icegatheringstatechange', onChange);
        this.peerConnection.removeEventListener('icecandidate', onCandidate);
      };
      const finish = () => {
        if (settled) return;
        // Never hand back a candidate-less description. The listener stays
        // attached and the first candidate resolves us instead.
        if (!this.hasLocalCandidate()) return;
        cleanup();
        resolve();
      };
      const onChange = () => {
        if (settled) return;
        if (this.peerConnection.iceGatheringState === 'complete') {
          // Gathering really is finished. Nothing more is coming, so release
          // even if it produced nothing — continuing to wait would hang the
          // call outright, which is worse than an offer the far end rejects.
          cleanup();
          resolve();
        }
      };
      const onCandidate = () => finish();
      // Nothing was gathered and nothing ever will be: the peer connection went
      // away (call cancelled, socket dropped) or the platform never produced a
      // candidate at all. Fail the setup rather than leave the caller waiting.
      const fail = (message: string) => {
        if (settled) return;
        cleanup();
        reject(new PhoneError({ code: 'call_failed', message, callId: this.id }));
      };
      const abort = () => fail('the call ended before any ICE candidate was gathered');
      const timer = setTimeout(finish, timeoutMs);
      const hardTimer = setTimeout(
        () => fail('ICE gathering produced no candidate'),
        hardTimeoutMs
      );
      this.gatheringAborts.add(abort);
      this.peerConnection.addEventListener('icegatheringstatechange', onChange);
      this.peerConnection.addEventListener('icecandidate', onCandidate);
    });
  }

  // Settles every in-flight gathering wait. Must run before the peer connection
  // is closed, since a closed connection emits no further ICE events.
  private abortIceGathering(): void {
    const aborts = [...this.gatheringAborts];
    this.gatheringAborts.clear();
    aborts.forEach((abort) => abort());
  }

  // Whether the local description carries at least one candidate. Read off the
  // description rather than counted from icecandidate events, because that is
  // what actually goes on the wire.
  private hasLocalCandidate(): boolean {
    const sdp = this.peerConnection.localDescription?.sdp;
    return !!sdp && /^a=candidate:/m.test(sdp);
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
    // Diagnostic: an audio sender with no `.dtmf` means the WebRTC impl lacks a
    // DTMFSender. On web this never happens (browsers always expose it); on React
    // Native it means the app installed a react-native-webrtc WITHOUT the DialStack
    // fork that adds `RTCRtpSender.dtmf`, so DTMF is silently unavailable. Warn
    // once so a misconfigured install surfaces instead of just a hidden keypad.
    if (sender && this.dtmfSender === null) warnMissingDtmfBridgeOnce();
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
