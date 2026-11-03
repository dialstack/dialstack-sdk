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
      "Native, use DialStack's react-native-webrtc fork, or any WebRTC package " +
      'that implements RTCRtpSender.dtmf — see the @dialstack/sdk-native README.'
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
  // The signalling socket dropped; the call stays up while the phone reconnects
  // and resumes its session. Actions issued meanwhile apply once it is back.
  reconnecting: () => void;
  // The session resumed and the call is reachable again.
  reconnected: () => void;
  audioInputChanged: (deviceId: string | null) => void;
  // The sender keeps a dead track, so the far end hears silence and nothing throws.
  audioInputLost: () => void;
};

type Listener<K extends keyof CallEventMap> = CallEventMap[K];

/**
 * The slice of a local conference a merged `Call` needs. Declared structurally
 * here (rather than importing `LocalConference`) so the core has no dependency
 * on the mixer — `conference.ts` imports `Call`, and the reverse import would
 * make that a cycle.
 */
export interface ConferenceSink {
  /** Apply mute across the merged legs' mixed uplinks. */
  setMuted(muted: boolean): void;
}

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
  // Hold the mic until this inbound call is answered. Threaded from
  // `PhoneOptions.deferInboundCapture`; see that option for why.
  deferInboundCapture?: boolean;
  // Mints the req_id stamped on each action frame, so the server's error reply
  // (which echoes it) can be traced back to this call and this action. Threaded
  // from the phone so ids stay unique across calls.
  nextReqId: () => string;
  // Fresh ICE servers for an ICE restart: TURN credentials expire, and a restart
  // on a new network may need a relay. Optional; without it the restart reuses
  // the servers the call started with.
  refreshIceServers?: () => Promise<RTCIceServer[]>;
  // ICE lost connectivity while the socket still looks up: a network change the
  // signalling socket hasn't noticed yet. The phone probes the socket.
  onIceTrouble?: () => void;
}

// How long ICE may sit in `disconnected` before the call restarts it. Short
// blips recover on their own; a network change does not.
const ICE_DISCONNECTED_RESTART_MS = 2_000;

// How long a sent restart offer may wait for its answer. The answer can be
// lost (it was emitted while the socket was down), and an unanswered restart
// would block every later one.
const ICE_RESTART_ANSWER_TIMEOUT_MS = 15_000;

// Retries of a restart that failed or got no answer, while ICE stays down:
// after 2s, 4s, then 8s. Past that the network is not coming back for this
// call; the far end ends it when media times out.
const ICE_RESTART_RETRIES = 3;
const ICE_RESTART_RETRY_BASE_MS = 2_000;

/**
 * `localMediaReady`'s rejection while capture is deferred. A distinct type so the
 * owner can tell "not acquired yet, by design" from a real microphone failure and
 * not report the former to the host as one.
 */
export class CaptureDeferred extends Error {
  constructor() {
    super('Microphone capture deferred until the call is answered');
    this.name = 'CaptureDeferred';
  }
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
   * True while the signalling socket is down and the phone is resuming its
   * session. The call is still up: audio keeps flowing on an unchanged
   * network, and hold, mute and hang-up issued now apply once it is back.
   */
  get isReconnecting(): boolean {
    return this.suspended;
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
  private readonly nextReqId: () => string;
  // req_ids of the action frames this call sent, so the phone can tie the
  // server's error reply to this call.
  private readonly issuedReqIds = new Set<string>();
  // The subset that were hangups: an error answering one means the server has no
  // such call, so it is over here too.
  private readonly hangupReqIds = new Set<string>();
  private readonly startConsult: (parent: Call, destination: string) => Promise<Call>;
  private localStream: MediaStream;
  private remoteStream: MediaStream;
  private dtmfSender: RTCDTMFSender | null = null;
  private durationTimer: ReturnType<typeof setInterval> | null = null;
  private answeredAt: number | null = null;
  private listeners: { [K in keyof CallEventMap]?: Set<Listener<K>> } = {};
  private endedSettled = false;
  private suspended = false;
  // ICE restart state: one at a time, and a restart wanted while suspended
  // waits for the resume (the gateway can't route the offer before it).
  private restartReqId: string | null = null;
  private restartWanted = false;
  // Until the restart offer is sent, the new generation's candidates are in
  // it, and frames for them must not reach the gateway first: it would file
  // them, and the end of gathering, under the generation being replaced.
  private restartOfferSent = false;
  private restartGatheringDone = false;
  // The restart offer's ufrag, and whether a candidate of that generation has
  // been seen. An end of candidates counts only after one has: before, it is
  // the old generation's, or one setConfiguration provoked, and taken for the
  // new one it sent end-of-candidates straight after the offer, so the gateway
  // dropped the srflx/relay candidates that followed. Telling the generations
  // apart by when events arrive is not enough, since an old one's can still
  // be delivered after the offer is set.
  private restartUfrag: string | null = null;
  private restartGathering = false;
  private restartAnswerTimer: ReturnType<typeof setTimeout> | null = null;
  private restartRetryTimer: ReturnType<typeof setTimeout> | null = null;
  private restartAttempts = 0;
  // The nominated pair last reported, so a repeat isn't resent.
  private reportedPair: string | null = null;
  private watchingSelectedPair = false;
  private iceDisconnectedTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly refreshIceServers: (() => Promise<RTCIceServer[]>) | null;
  private readonly onIceTrouble: (() => void) | null;
  private pendingAnswerSdp: string | null = null;
  // Held across buildAnswer's awaits so a second caller cannot start one while
  // the first is mid-flight; pendingAnswerSdp only lands after the work is done.
  private buildingAnswer = false;
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
  // Set when a mic switch arrives while merged: the id is recorded but the
  // track is not swapped, so unmerging has to apply it.
  private deferredAudioInput = false;
  private conference: ConferenceSink | null = null;
  // Serializes device switches: two overlapping switches would otherwise interleave
  // their acquire/replace/stop steps, and one could stop the track the other installed.
  private switchChain: Promise<void> = Promise.resolve();
  // True until answer() acquires the mic this call deliberately did not take on
  // arrival. Cleared there so a later device switch takes the ordinary path.
  private captureDeferred = false;

  constructor(init: CallInit) {
    this.id = init.id;
    this.direction = init.direction;
    this.from = init.from;
    this.fromName = init.fromName;
    this.to = init.to;
    this.state = init.initialState;
    this.transport = init.transport;
    this.nextReqId = init.nextReqId;
    this.startConsult = init.startConsult;
    this.refreshIceServers = init.refreshIceServers ?? null;
    this.onIceTrouble = init.onIceTrouble ?? null;
    this.ringback = init.ringback ?? new RingbackTone();
    this.ringback.setSinkId?.(init.audioOutputDeviceId ?? null);
    this.localStream = createMediaStream();
    this.remoteStream = createMediaStream();
    this.audioInputDeviceId_ = init.audioInputDeviceId ?? null;

    this.peerConnection = createPeerConnection(init.iceServers);
    this.wirePeerConnection();
    // Deferred capture is REJECTED, not pending: switchAudioInput awaits this with
    // no timeout, so a pending promise would deadlock the very path that acquires
    // the mic later. Rejected means "no media yet" — which is exactly the state the
    // recovered-from-a-denial path already knows how to repair.
    this.captureDeferred = (init.deferInboundCapture ?? false) && init.direction === 'inbound';
    this.localMediaReady = this.captureDeferred
      ? Promise.reject(new CaptureDeferred())
      : this.acquireLocalMedia();
    // Nothing awaits a deferred rejection until answer(), and an unhandled one
    // would surface as a process-level unhandled rejection.
    if (this.captureDeferred) this.localMediaReady.catch(() => {});
  }

  /**
   * Take the mic this call deliberately skipped on arrival, then produce the
   * answer SDP from it.
   *
   * `buildAnswer` is what needs the track: setRemoteDescription created a
   * track-less sender per m-line, and answering without attaching a real track
   * yields `a=recvonly` — the far end hears nothing, which is the failure this
   * whole path exists to avoid. It runs only once the offer has been set;
   * otherwise prepareAnswerForOffer does it when the offer lands.
   */
  private acquireDeferredCapture(): void {
    this.captureDeferred = false;
    this.localMediaReady = this.acquireLocalMedia();
    // The owner re-subscribes for the failure (see whenLocalMediaReady); here we
    // only need the success path. A rejection is swallowed so it cannot surface as
    // an unhandled rejection before the owner attaches.
    void this.localMediaReady.then(async () => {
      if (this.isFinished || this.answerSent || !this.remoteDescriptionSet) return;
      // Nothing awaits this build, so its failure would otherwise vanish as an
      // unhandled rejection and leave the call ringing with no answer sent.
      await this.buildAnswer().catch(this.reportAnswerFailure);
    }, this.reportCaptureFailure);
  }

  private reportAnswerFailure: (e: unknown) => void = () => {};

  /** @internal Set by the owner to surface an answer built off the offer path failing. */
  onAnswerFailure(report: (e: unknown) => void): void {
    this.reportAnswerFailure = report;
  }

  /** Set by the owner to surface a late mic failure, since `Call` has no error event. */
  private reportCaptureFailure: (e: unknown) => void = () => {};

  onCaptureFailure(report: (e: unknown) => void): void {
    this.reportCaptureFailure = report;
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
      // A retry for a call that is already over would prompt again for nothing.
      if (!preferred || !isRetryableWithoutDevice(e) || this.isFinished) throw e;
      stream = await getUserMedia({ audio: true });
    }
    // The call ended while the prompt was open: releaseMedia already ran and can't
    // see these tracks; unstopped, the mic indicator stays lit.
    if (this.isFinished) {
      stream.getTracks().forEach(stopTrack);
      return;
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
    // The conference mixes against this call's capture stream, so replacing the
    // mic here would leave the graph feeding a stopped track. Apply on unmerge.
    if (this.conference) {
      this.audioInputDeviceId_ = deviceId;
      this.deferredAudioInput = true;
      return;
    }
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

  /**
   * @internal True once the call is over by either path: the server's call.ended
   * (which sets endedSettled) or a local dispose().
   */
  get isFinished(): boolean {
    return this.endedSettled || this.state === 'ended';
  }

  private issueReqId(): string {
    const reqId = this.nextReqId();
    this.issuedReqIds.add(reqId);
    return reqId;
  }

  /** @internal Whether `reqId` names an action frame this call sent. */
  ownsRequest(reqId: string): boolean {
    return this.issuedReqIds.has(reqId);
  }

  /** @internal The server's error reply to one of this call's actions. */
  handleActionError(reqId: string): void {
    if (!this.issuedReqIds.delete(reqId)) return;
    if (reqId === this.restartReqId) this.abandonIceRestart();
    // The server refuses a hangup only when it has no such call (a repeat of one
    // it already ended is accepted), so any error answering one means the call
    // is over. Revisit this if the server ever refuses a hangup for another reason.
    if (this.hangupReqIds.delete(reqId)) this.settleEnded('hangup');
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
    // A stale tap on a call that already ended must not take the mic for it.
    if (this.answerSent || this.isFinished) return;
    // Deferred capture is taken HERE, not on arrival: the OS owns the audio
    // session and only activates it on answer, so acquiring earlier fails and
    // costs the call its mic entirely. Not awaited — answer() stays synchronous,
    // and the answer SDP is built once the track lands, via the same path that
    // recovers from a denied mic.
    if (this.captureDeferred) this.acquireDeferredCapture();
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
    if (this.answerSent || this.isFinished || !this.pendingAnswerSdp) return;
    this.transport.send({ type: 'call.answer', req_id: this.issueReqId(), call_id: this.id });
    this.transport.send({ type: 'sdp.answer', call_id: this.id, sdp: this.pendingAnswerSdp });
    this.answerSent = true;
  }

  reject(reason: RejectReason = 'decline'): void {
    this.transport.send({
      type: 'call.reject',
      req_id: this.issueReqId(),
      call_id: this.id,
      reason,
    });
  }

  hangup(): void {
    if (this.endedSettled) return;
    const reqId = this.issueReqId();
    this.hangupReqIds.add(reqId);
    this.transport.sendOrQueue({ type: 'call.hangup', req_id: reqId, call_id: this.id });
    // Nothing is waiting for the server to agree: the hangup goes out on the
    // resume, and if there is none the server ends the call itself.
    if (this.suspended) this.settleEnded('hangup');
  }

  hold(): void {
    // Hold is a server-side media stop: it would silence that party to the
    // others while the screen still shows one live conversation.
    if (this.conference) return;
    // Only an active call can be held. A no-op otherwise (e.g. a still-ringing
    // outbound the multi-call layer auto-holds when the user answers a second
    // call) — sending call.hold for a non-active call draws a server
    // `invalid_message: call is not active` that surfaces as a spurious error.
    if (this.state !== 'active') return;
    this.refuseWhileReconnecting();
    this.transport.sendOrQueue({ type: 'call.hold', req_id: this.issueReqId(), call_id: this.id });
  }

  /**
   * Hold or resume this leg as part of holding the whole conference.
   *
   * `hold()` refuses while merged because holding ONE party silences it to the
   * other. Holding every leg together is the coherent version, so the caller
   * that does that reaches the frames through here.
   */
  setConferenceHold(held: boolean): void {
    if (this.state === 'ended') return;
    this.refuseWhileReconnecting();
    this.transport.sendOrQueue({
      type: held ? 'call.hold' : 'call.resume',
      req_id: this.issueReqId(),
      call_id: this.id,
    });
  }

  /**
   * Re-hold a call `resume()` ran on in this same tick. `hold()`'s
   * `state !== 'active'` guard would swallow it, since the state only flips on
   * the server echo. Only for that unwind; use `hold()` everywhere else.
   */
  holdAfterResume(): void {
    if (this.conference) return;
    if (this.state === 'ended') return;
    this.refuseWhileReconnecting();
    this.transport.sendOrQueue({ type: 'call.hold', req_id: this.issueReqId(), call_id: this.id });
  }

  resume(): void {
    // Symmetric to hold(): only a held call can be resumed.
    if (this.state !== 'held') return;
    this.refuseWhileReconnecting();
    this.transport.sendOrQueue({
      type: 'call.resume',
      req_id: this.issueReqId(),
      call_id: this.id,
    });
  }

  mute(): void {
    this.setMuted(true);
  }

  unmute(): void {
    this.setMuted(false);
  }

  /**
   * Mute has two layers, and a merged call needs both handled differently.
   *
   * Normally: flip the mic track (instant local feedback) AND send `call.mute`,
   * which the server turns into a re-INVITE narrowing the leg's SDP direction to
   * `recvonly` — defence in depth against a peer that ignores the local disable.
   *
   * While MERGED neither of those works:
   * - the wire carries the conference's mixed track, not this call's mic track,
   *   so toggling `localStream` no longer reaches the far end (the mic is an
   *   input to the mixer now). The conference toggles the mixed uplinks instead.
   * - the server frame must be withheld: `recvonly` would stop this leg's
   *   upstream media at the far end regardless of what the graph does, which is
   *   silent one-way audio for the other conference parties. Muting a merged
   *   call is a purely local mix decision.
   */
  private setMuted(muted: boolean): void {
    if (this.conference) {
      this.conference.setMuted(muted);
    }
    // `call.mute` is withheld while merged: the server answers it with a
    // `recvonly` re-INVITE, cutting the other parties off. `call.unmute` only
    // ever widens what the server permits, so it is always safe — and without it
    // a pre-merge mute would stay `recvonly` with no way back.
    if (!muted || !this.conference) {
      this.transport.sendOrQueue({
        type: muted ? 'call.mute' : 'call.unmute',
        req_id: this.issueReqId(),
        call_id: this.id,
      });
    }
    // Unmerge restores this track to the wire and re-applies `isMuted`.
    this.localStream.getAudioTracks().forEach((t) => (t.enabled = !muted));
    this.isMuted = muted;
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
    this.refuseWhileReconnecting();
    this.transport.sendOrQueue({
      type: 'call.transfer',
      req_id: this.issueReqId(),
      call_id: this.id,
      destination,
    });
  }

  /**
   * Attended (consultative) transfer, step 1: hold this call and dial
   * `destination` as a consult leg. Resolves with the consult Call. Once the
   * consult party answers, call `completeTransfer()` on THIS call to bridge
   * them; or hang up the consult and `resume()` to abandon the transfer.
   */
  attendedTransfer(destination: string): Promise<Call> {
    // The consult frame holds this call server-side, silencing that party to the
    // others. Guarded here as well as in the hook: a host holding the Call can
    // reach this directly.
    if (this.conference) {
      throw new PhoneError({
        code: 'invalid_message',
        message: 'Cannot transfer a call that is part of a conference',
        callId: this.id,
      });
    }
    this.assertTransferable();
    this.refuseWhileReconnecting();
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
    this.refuseWhileReconnecting();
    this.transport.sendOrQueue({
      type: 'call.transfer.attended',
      req_id: this.issueReqId(),
      call_id: this.id,
      step: 'complete',
    });
  }

  /**
   * Hold, resume and transfer are refused while the call is reconnecting rather
   * than queued for the resume: the user would see nothing happen, then have
   * it happen up to the resume window later, after they may have tried again or
   * moved on. Mute and hangup still work, since both take effect locally at once.
   */
  private refuseWhileReconnecting(): void {
    if (!this.suspended) return;
    throw new PhoneError({
      code: 'transport_closed',
      message: 'The call is reconnecting',
      callId: this.id,
    });
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

  /**
   * The local capture (mic) stream. A local conference mixes against this rather
   * than opening a second `getUserMedia`, so every merged leg shares the one
   * capture the call already owns.
   */
  get localMediaStream(): MediaStream {
    return this.localStream;
  }

  /**
   * Attach (or detach, with null) the local conference this call is merged into.
   *
   * While attached, the wire carries the conference's MIXED track rather than
   * this call's mic track, which changes what mute has to do — see `mute()`.
   * Set by the conference owner (the softphone's merge action), not by the core.
   */
  attachConference(conference: ConferenceSink | null): void {
    const wasMerged = this.conference !== null;
    this.conference = conference;
    // Detaching: apply a mic switch the merge deferred. switchAudioInput only
    // recorded the id while the mixer was tapping this call's capture stream —
    // without this the picker reports a device that never went on the wire.
    if (wasMerged && !conference && this.deferredAudioInput) {
      this.deferredAudioInput = false;
      void this.setAudioInputDevice(this.audioInputDeviceId_).catch(() => undefined);
    }
  }

  async startOutbound(): Promise<RTCSessionDescriptionInit> {
    await this.localMediaReady;
    this.localStream.getTracks().forEach((t) => this.peerConnection.addTrack(t, this.localStream));
    this.attachDtmfSender();
    const offer = await this.peerConnection.createOffer();
    await this.peerConnection.setLocalDescription(offer);
    // Half trickle (RFC 8840 § 5.3, RFC 8838 § 16): nothing has told us yet
    // that the far end takes trickled candidates, so the first offer waits for
    // gathering to complete. Candidates gathered after the cap trickle.
    await this.waitForIceGatheringComplete(2000, 15000, { peerTrickles: false });
    return this.localDescriptionOr(offer);
  }

  async prepareAnswerForOffer(sdp: string): Promise<void> {
    // Set the remote description first (no mic needed) so any ICE candidates
    // buffered while the mic prompt was open can be applied, then wait for the
    // local mic before building the answer — the offer may have arrived while
    // getUserMedia was still pending.
    //
    // The call can end at any of these awaits — the caller hangs up, another
    // device in a ring group answers, the user declines — and teardown closes the
    // peer connection, which then throws on every operation. That is not a
    // failure to report: the call is simply over, so stop without rejecting.
    if (this.isFinished) return;
    try {
      await this.peerConnection.setRemoteDescription({ type: 'offer', sdp });
      this.remoteDescriptionSet = true;
      await this.flushPendingRemoteCandidates();
    } catch (e) {
      if (this.isFinished) return;
      throw e;
    }
    try {
      await this.localMediaReady;
    } catch {
      // Mic acquisition failed. handleIncoming already surfaces this via
      // whenLocalMediaReady().catch, so abort answer preparation here without
      // rejecting — otherwise the owner would emit a duplicate 'error' for the
      // same denial.
      return;
    }
    if (this.isFinished) return;
    await this.buildAnswer();
  }

  // Builds (or rebuilds) the answer from an already-set remote description. Split
  // out of prepareAnswerForOffer so a mic acquired late — after a denial the user
  // recovered from — can still produce one: the server sends sdp.offer right after
  // call.incoming, so by then the offer has already been consumed and discarded.
  private async buildAnswer(): Promise<void> {
    // Two paths reach here for one call — prepareAnswerForOffer when the offer
    // lands, and a late mic acquisition (a recovered denial, or capture deferred
    // to answer). Once a local answer is set the connection is back to `stable`,
    // where setLocalDescription throws, so a second build must not run.
    //
    // The latch is set SYNCHRONOUSLY, before the first await, because the two
    // paths can both be waiting on the same pending getUserMedia: answering
    // before the offer arrives (ordinary on a push wake) leaves both continuations
    // queued on one promise, and an entry check against `pendingAnswerSdp` alone
    // lets both through — it is not assigned until after createAnswer and
    // setLocalDescription have already run.
    if (this.buildingAnswer || this.pendingAnswerSdp) return;
    this.buildingAnswer = true;
    try {
      await this.buildAnswerOnce();
    } catch (e) {
      // Teardown mid-build rejects whichever await was in flight (a closed peer
      // connection, or the ICE wait releaseMedia aborts); see prepareAnswerForOffer.
      if (!this.isFinished) throw e;
    } finally {
      this.buildingAnswer = false;
    }
  }

  private async buildAnswerOnce(): Promise<void> {
    // Rechecked after every await: the call may have ended while it was pending.
    if (this.isFinished) return;
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
    if (this.isFinished) return;
    await this.peerConnection.setLocalDescription(answer);
    if (this.isFinished) return;
    // RFC 8838 § 5: the answer may carry any candidates only if the offer
    // advertised trickle; otherwise the far end does regular ICE and needs a
    // complete set.
    await this.waitForIceGatheringComplete(2000, 15000, {
      peerTrickles: this.remoteAdvertisesTrickle(),
    });
    if (this.isFinished) return;
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
    // As in prepareAnswerForOffer: an end landing mid-apply closes the connection,
    // and that is not a failure to report.
    if (this.isFinished) return;
    // An answer to an ICE restart settles it, applied or not.
    const restart = this.restartReqId;
    if (restart) {
      this.issuedReqIds.delete(restart);
      this.clearRestart();
    }
    try {
      await this.peerConnection.setRemoteDescription({ type: 'answer', sdp });
      this.remoteDescriptionSet = true;
      await this.flushPendingRemoteCandidates();
    } catch (e) {
      if (this.isFinished) return;
      if (restart) {
        // Back to the description ICE was running on; a retry offers afresh.
        this.rollbackLocalOffer();
        this.scheduleIceRestartRetry();
      }
      throw e;
    }
  }

  async addRemoteCandidate(
    candidate: string,
    sdpMid: string | null,
    sdpMLineIndex: number | null
  ): Promise<void> {
    // A disposed call stays routable, but its closed connection rejects every
    // candidate, and the caller does not await this.
    if (this.isFinished) return;
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

  /**
   * @internal The socket dropped and the phone is resuming the session; the call
   * stays up meanwhile.
   */
  suspend(): void {
    if (this.suspended || this.endedSettled) return;
    this.suspended = true;
    // A restart under way may lose its answer with the socket; drop it now
    // and run a fresh one once the session is back.
    if (this.restartReqId) {
      this.abandonIceRestart();
      this.restartWanted = true;
    }
    this.emit('reconnecting');
  }

  /**
   * @internal The resumed session still has this call. Adopts the server's view
   * of its hold state, which the frames lost in the gap may have changed.
   *
   * Mute goes the other way: the user's choice is the local one, and the track
   * already follows it, so a server that disagrees lost a mute or unmute on
   * the dying socket and is told again. One the user made during the drop was
   * queued and is already on its way; sending it twice changes nothing.
   */
  restore(msg: Extract<ServerMessage, { type: 'call.restored' }>): void {
    if (this.endedSettled) return;
    const { held } = msg;
    if (held && this.state !== 'held') {
      this.state = 'held';
      this.emit('held', 'local');
    } else if (!held && this.state === 'held') {
      this.state = 'active';
      this.emit('resumed');
    }
    // Merged, a mute stays local by design (see setMuted).
    if (msg.muted !== this.isMuted && !(this.isMuted && this.conference)) {
      this.transport.sendOrQueue({
        type: this.isMuted ? 'call.mute' : 'call.unmute',
        req_id: this.issueReqId(),
        call_id: this.id,
      });
    }
    if (!this.suspended) return;
    this.suspended = false;
    this.emit('reconnected');
    // A restart under way when the socket dropped may have lost its answer
    // with it; start over rather than wait on it.
    if (this.restartReqId) {
      this.abandonIceRestart();
      this.restartWanted = true;
    }
    // A drop that came with a network change left ICE on the old network, so
    // media is dead until the restart; only now can the gateway route it.
    const ice = this.peerConnection.iceConnectionState;
    if (this.restartWanted || ice === 'disconnected' || ice === 'failed') {
      this.restartWanted = false;
      this.requestIceRestart();
    }
  }

  /**
   * Restart ICE on this call: gather candidates afresh on the current network
   * and renegotiate them with the far end. The call does this by itself when
   * ICE fails, stays disconnected, or a resumed session finds media down; it is
   * public for hosts that learn of a network change first (an OS event).
   * A no-op unless the call is connected, and while a restart is under way.
   */
  restartIce(): void {
    this.requestIceRestart();
  }

  private requestIceRestart(): void {
    if (this.endedSettled || !this.isConnected) return;
    if (this.suspended) {
      this.restartWanted = true;
      return;
    }
    if (this.restartReqId) return;
    if (this.restartRetryTimer) {
      clearTimeout(this.restartRetryTimer);
      this.restartRetryTimer = null;
    }
    const reqId = this.issueReqId();
    this.restartReqId = reqId;
    // The restart starts a new generation, whose pair is reported afresh.
    this.reportedPair = null;
    this.restartOfferSent = false;
    this.restartGatheringDone = false;
    this.restartUfrag = null;
    this.restartGathering = false;
    void this.runIceRestart(reqId).catch((e) => {
      logWarn('ICE restart failed', { callId: this.id, error: (e as Error).message });
      this.abandonIceRestart();
      this.scheduleIceRestartRetry();
    });
  }

  private async runIceRestart(reqId: string): Promise<void> {
    if (this.refreshIceServers) {
      try {
        const iceServers = await this.refreshIceServers();
        this.peerConnection.setConfiguration({
          ...this.peerConnection.getConfiguration(),
          iceServers,
        });
      } catch (e) {
        // The servers the call started with may still do; restart anyway.
        logWarn('Could not refresh ICE servers for the restart', { error: (e as Error).message });
      }
    }
    if (this.isFinished || this.restartReqId !== reqId) return;
    const offer = await this.peerConnection.createOffer({ iceRestart: true });
    await this.peerConnection.setLocalDescription(offer);
    this.restartUfrag = /^a=ice-ufrag:(\S+)/m.exec(offer.sdp ?? '')?.[1] ?? '';
    // A later exchange may be partial once the far end has advertised trickle
    // (RFC 8838 § 3); otherwise this waits like the call's first offer.
    await this.waitForIceGatheringComplete(2000, 15000, {
      freshGeneration: true,
      peerTrickles: this.remoteAdvertisesTrickle(),
    });
    if (this.isFinished || this.restartReqId !== reqId) return;
    this.transport.sendOrQueue({
      type: 'sdp.offer',
      req_id: reqId,
      call_id: this.id,
      sdp: this.localDescriptionOr(offer).sdp ?? '',
    });
    this.restartOfferSent = true;
    // Gathering finished before the offer went: say so now, after it, so the
    // end of candidates lands on the new generation (RFC 8838 § 13).
    if (this.restartGatheringDone) {
      this.transport.trySendOrQueue({ type: 'ice.done', call_id: this.id });
    }
    this.restartAnswerTimer = setTimeout(() => {
      this.restartAnswerTimer = null;
      if (this.restartReqId !== reqId) return;
      logWarn('ICE restart got no answer', { callId: this.id });
      this.abandonIceRestart();
      this.scheduleIceRestartRetry();
    }, ICE_RESTART_ANSWER_TIMEOUT_MS);
  }

  // The restart is over without an answer: drop the half-done offer so a later
  // one can start from a stable state.
  private abandonIceRestart(): void {
    this.clearRestart();
    this.rollbackLocalOffer();
  }

  private clearRestart(): void {
    this.restartReqId = null;
    this.restartOfferSent = false;
    this.restartGatheringDone = false;
    this.restartUfrag = null;
    this.restartGathering = false;
    if (this.restartAnswerTimer) {
      clearTimeout(this.restartAnswerTimer);
      this.restartAnswerTimer = null;
    }
  }

  private rollbackLocalOffer(): void {
    if (this.isFinished || this.peerConnection.signalingState !== 'have-local-offer') return;
    void this.peerConnection.setLocalDescription({ type: 'rollback' }).catch(() => undefined);
  }

  // Try again while media is still down, a bounded number of times.
  private scheduleIceRestartRetry(): void {
    if (this.endedSettled || this.restartRetryTimer) return;
    if (this.restartAttempts >= ICE_RESTART_RETRIES) return;
    const delay = ICE_RESTART_RETRY_BASE_MS * 2 ** this.restartAttempts;
    this.restartAttempts += 1;
    this.restartRetryTimer = setTimeout(() => {
      this.restartRetryTimer = null;
      const ice = this.peerConnection.iceConnectionState;
      if (ice === 'failed' || ice === 'disconnected') this.requestIceRestart();
    }, delay);
  }

  /**
   * @internal End the call here without waiting for the server, because the
   * socket it lived on is gone. Emits `ended` like a server end, so every owner
   * tears down the same way.
   */
  endLocally(reason: CallEndReason): void {
    this.settleEnded(reason);
  }

  private settleEnded(reason: CallEndReason): void {
    if (this.endedSettled) return;
    this.endedSettled = true;
    this.suspended = false;
    if (this.iceDisconnectedTimer) {
      clearTimeout(this.iceDisconnectedTimer);
      this.iceDisconnectedTimer = null;
    }
    this.clearRestart();
    if (this.restartRetryTimer) {
      clearTimeout(this.restartRetryTimer);
      this.restartRetryTimer = null;
    }
    // Nothing can answer an ended call's actions any more.
    this.issuedReqIds.clear();
    this.hangupReqIds.clear();
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

    this.peerConnection.addEventListener('iceconnectionstatechange', () =>
      this.onIceConnectionStateChange()
    );

    this.peerConnection.addEventListener('icecandidate', (evt) => {
      // ICE candidates fire asynchronously from the peer connection and can
      // arrive while the socket is mid-reconnect or closed. Use best-effort
      // trySend so a late candidate doesn't throw an uncaught PhoneError into
      // this handler (trickle ICE tolerates loss; a closed socket means the
      // call is already tearing down). While the session is detached they
      // queue with everything else, so they can't overtake the frames before
      // them.
      //
      // While a restart runs, only the new generation's events count: the
      // old one's candidates are stale, and its end of candidates would end
      // the new generation's trickle at the gateway.
      if (this.restartReqId) {
        if (evt.candidate) {
          if (!this.isRestartGeneration(evt.candidate)) return;
          this.restartGathering = true;
        } else if (!this.restartGathering) {
          return;
        }
        // Its own candidates wait for its offer, which carries every one
        // gathered so far; only the end of gathering is worth remembering.
        if (!this.restartOfferSent) {
          if (!evt.candidate) this.restartGatheringDone = true;
          return;
        }
      }
      if (evt.candidate) {
        this.transport.trySendOrQueue({
          type: 'ice.candidate',
          call_id: this.id,
          candidate: evt.candidate.candidate,
          sdp_mid: evt.candidate.sdpMid ?? null,
          sdp_m_line_index: evt.candidate.sdpMLineIndex ?? null,
        });
      } else {
        this.transport.trySendOrQueue({ type: 'ice.done', call_id: this.id });
      }
    });
  }

  // A network change shows up here first when the signalling socket survives
  // it, or hasn't noticed yet. `failed` is final for this ICE generation;
  // `disconnected` often recovers by itself within a second or two, so it gets
  // that long before the call restarts.
  private onIceConnectionStateChange(): void {
    const state = this.peerConnection.iceConnectionState;
    if (state !== 'disconnected' && this.iceDisconnectedTimer) {
      clearTimeout(this.iceDisconnectedTimer);
      this.iceDisconnectedTimer = null;
    }
    if (state === 'connected' || state === 'completed') {
      this.restartAttempts = 0;
      this.watchSelectedPair();
      void this.reportSelectedPair();
    }
    if (this.endedSettled || !this.isConnected) return;
    if (state === 'failed') {
      this.requestIceRestart();
    } else if (state === 'disconnected' && !this.iceDisconnectedTimer) {
      this.onIceTrouble?.();
      this.iceDisconnectedTimer = setTimeout(() => {
        this.iceDisconnectedTimer = null;
        if (this.peerConnection.iceConnectionState === 'disconnected') this.requestIceRestart();
      }, ICE_DISCONNECTED_RESTART_MS);
    }
  }

  // Tells the gateway which candidate pair ICE nominated. Offers and answers
  // it builds later (hold, mute, the far end's re-INVITEs) must list only that
  // pair once there is one (RFC 8839 § 4.4.1.2.2), and only this side knows it.
  //
  // The report names its ICE generation by ufrag, so the gateway can drop one a
  // restart has overtaken. None goes out while a restart is in flight: the
  // pair then still belongs to the old generation while the local description
  // already names the new one.
  private async reportSelectedPair(): Promise<void> {
    if (this.restartReqId) return;
    const ufrag = iceUfrag(this.peerConnection.localDescription?.sdp);
    if (!ufrag) return;
    const pair = await selectedCandidatePair(this.peerConnection).catch(() => null);
    if (!pair || this.endedSettled || this.restartReqId) return;
    if (iceUfrag(this.peerConnection.localDescription?.sdp) !== ufrag) return;
    const key = `${ufrag}|${pair.local}|${pair.remote}`;
    if (key === this.reportedPair) return;
    this.reportedPair = key;
    this.transport.trySendOrQueue({
      type: 'ice.selected',
      call_id: this.id,
      local: pair.local,
      remote: pair.remote,
      ufrag,
    });
  }

  // ICE can switch pairs without leaving `connected`, which fires no state
  // change; the transport's own event covers that where the platform has it.
  private watchSelectedPair(): void {
    if (this.watchingSelectedPair) return;
    const ice = iceTransportOf(this.peerConnection);
    if (!ice?.addEventListener) return;
    this.watchingSelectedPair = true;
    ice.addEventListener('selectedcandidatepairchange', () => void this.reportSelectedPair());
  }

  // How long a description waits for its candidates depends on what the far end
  // has said about trickle (RFC 8838, RFC 8840):
  //
  //   - peerTrickles: its description advertised a=ice-options:trickle, so
  //     ours may carry any candidates (RFC 8838 § 5 for an answer, § 3 for a
  //     later exchange). Release at the first candidate; the rest trickle.
  //   - otherwise: half trickle (RFC 8840 § 5.3, RFC 8838 § 16). Wait for
  //     gathering to complete, capped at timeoutMs so a slow or unreachable
  //     STUN/TURN server can't stall the call; what arrives after the cap
  //     trickles. The call's first offer is always this case, since nothing
  //     has been heard from the far end yet. Assuming trickle there would need
  //     Require: trickle-ice (RFC 8840 § 5.1), which turns a wrong assumption
  //     into a failed call.
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
  // first candidate — still half trickle, whose initial description need only
  // be "usable but not necessarily full" (RFC 8838 § 16).
  // Waiting past the cap is only safe because two things can still end the wait
  // when no candidate ever arrives: the hard deadline below, and abortIceGathering()
  // on teardown. A closed peer connection fires no further ICE events, so without
  // those the promise would neither resolve nor reject and the caller's call()/
  // answer() would hang with no error to surface.
  // freshGeneration: an ICE restart's offer was just set, and the gathering
  // state can still read the old generation's `complete` before the browser
  // moves it to `gathering`. Trusted then, the offer would go out with none of
  // the new generation's candidates.
  private waitForIceGatheringComplete(
    timeoutMs = 2000,
    hardTimeoutMs = 15000,
    { freshGeneration = false, peerTrickles }: { freshGeneration?: boolean; peerTrickles: boolean }
  ): Promise<void> {
    if (
      this.peerConnection.iceGatheringState === 'complete' &&
      (!freshGeneration || this.hasLocalCandidate())
    ) {
      return Promise.resolve();
    }
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
        if (this.peerConnection.iceGatheringState !== 'complete') return;
        // On a restart, a `complete` with nothing gathered can be the old
        // generation's, delivered late (seen on React Native). Wait for a
        // candidate instead; the hard deadline fails the restart if none comes.
        if (freshGeneration && !this.hasLocalCandidate()) return;
        // Gathering really is finished. Nothing more is coming, so release
        // even if it produced nothing — continuing to wait would hang the
        // call outright, which is worse than an offer the far end rejects.
        cleanup();
        resolve();
      };
      // Before the cap a candidate releases the wait only when the far end
      // takes the rest by trickle.
      let capped = false;
      const onCandidate = () => {
        if (capped || peerTrickles) finish();
      };
      // Nothing was gathered and nothing ever will be: the peer connection went
      // away (call cancelled, socket dropped) or the platform never produced a
      // candidate at all. Fail the setup rather than leave the caller waiting.
      const fail = (message: string) => {
        if (settled) return;
        cleanup();
        reject(new PhoneError({ code: 'call_failed', message, callId: this.id }));
      };
      const abort = () => fail('the call ended before any ICE candidate was gathered');
      const timer = setTimeout(() => {
        capped = true;
        finish();
      }, timeoutMs);
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

  // Whether the far end's description advertises trickle ICE (RFC 8840 § 4.1:
  // a=ice-options carrying the "trickle" token).
  private remoteAdvertisesTrickle(): boolean {
    const sdp = this.peerConnection.remoteDescription?.sdp ?? '';
    return /^a=ice-options:.*\btrickle\b/m.test(sdp);
  }

  // Whether a candidate belongs to the running restart's generation. None can
  // before its offer is set, since that is what starts it gathering. After,
  // the candidate's ufrag decides; a platform that reports none is trusted.
  private isRestartGeneration(candidate: RTCIceCandidate): boolean {
    if (this.restartUfrag === null) return false;
    const ufrag =
      candidate.usernameFragment ?? /\bufrag (\S+)/.exec(candidate.candidate ?? '')?.[1] ?? null;
    return ufrag === null || !this.restartUfrag || ufrag === this.restartUfrag;
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

interface CandidateStats {
  foundation?: string;
  protocol?: string;
  priority?: number;
  address?: string;
  ip?: string;
  port?: number;
  candidateType?: string;
}

// An SDP candidate value rebuilt from candidate stats, for stacks that expose
// no RTCIceCandidate for the selected pair.
function candidateFromStats(c: CandidateStats): string | null {
  const address = c.address ?? c.ip;
  if (!address || c.port === undefined || !c.protocol || !c.candidateType) return null;
  return `candidate:${c.foundation ?? '1'} 1 ${c.protocol} ${c.priority ?? 0} ${address} ${c.port} typ ${c.candidateType}`;
}

/**
 * The nominated candidate pair, as SDP candidate values. Read from the ICE
 * transport where the stack exposes it (browsers), else from stats (React
 * Native). Null before nomination.
 */
type IceTransportLike = {
  getSelectedCandidatePair?: () => {
    local?: RTCIceCandidate;
    remote?: RTCIceCandidate;
  } | null;
  addEventListener?: (event: string, handler: () => void) => void;
};

// The ICE transport under the call's media, where the platform exposes it
// (browsers do; React Native WebRTC does not).
function iceTransportOf(pc: RTCPeerConnection): IceTransportLike | undefined {
  return (pc.getSenders?.()[0] as { transport?: { iceTransport?: IceTransportLike } } | undefined)
    ?.transport?.iceTransport;
}

// The ICE username fragment a description declares, session or media level.
function iceUfrag(sdp: string | undefined): string | null {
  return sdp?.match(/^a=ice-ufrag:(\S+)/m)?.[1] ?? null;
}

async function selectedCandidatePair(
  pc: RTCPeerConnection
): Promise<{ local: string; remote: string } | null> {
  const ice = iceTransportOf(pc);
  const direct = ice?.getSelectedCandidatePair?.();
  if (direct?.local?.candidate && direct.remote?.candidate) {
    return { local: direct.local.candidate, remote: direct.remote.candidate };
  }
  if (typeof pc.getStats !== 'function') return null;
  const stats = await pc.getStats();
  const byId = new Map<string, Record<string, unknown>>();
  let pairId: string | undefined;
  stats.forEach((s: Record<string, unknown>) => {
    byId.set(s.id as string, s);
    if (s.type === 'transport' && typeof s.selectedCandidatePairId === 'string') {
      pairId = s.selectedCandidatePairId;
    }
  });
  if (!pairId) {
    stats.forEach((s: Record<string, unknown>) => {
      if (!pairId && s.type === 'candidate-pair' && s.nominated && s.state === 'succeeded') {
        pairId = s.id as string;
      }
    });
  }
  const pair = pairId ? byId.get(pairId) : undefined;
  if (!pair) return null;
  const local = candidateFromStats(byId.get(pair.localCandidateId as string) ?? {});
  const remote = candidateFromStats(byId.get(pair.remoteCandidateId as string) ?? {});
  return local && remote ? { local, remote } : null;
}
