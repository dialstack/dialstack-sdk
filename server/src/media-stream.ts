/**
 * DialStack Media Stream
 *
 * Handles bidirectional audio streaming over WebSocket for voice apps.
 * DialStack connects to your WebSocket server when executing an `attach` action.
 *
 * @example
 * ```typescript
 * import { MediaStream } from '@dialstack/sdk-server';
 * import { WebSocketServer } from 'ws';
 *
 * const wss = new WebSocketServer({ port: 8080 });
 *
 * wss.on('connection', (ws) => {
 *   const stream = new MediaStream(ws);
 *
 *   stream.on('begin', (event) => {
 *     console.log('Call started:', event.call_id);
 *   });
 *
 *   stream.on('audio', (event) => {
 *     // Process caller audio, get AI response
 *     const responseAudio = processAudio(event.payload);
 *     stream.sendAudio(responseAudio);
 *   });
 *
 *   stream.on('dtmf', (event) => {
 *     console.log('Caller pressed', event.digit);
 *   });
 *
 *   // When the caller talks over the agent, drop what is still queued.
 *   onBargeIn(() => stream.sendClear());
 *
 *   stream.on('close', () => {
 *     console.log('Call ended');
 *   });
 * });
 * ```
 */

import { EventEmitter } from 'events';

// ============================================================================
// Types
// ============================================================================

/**
 * Minimal WebSocket interface compatible with the 'ws' package.
 * This allows the SDK to work without requiring 'ws' types.
 */
export interface WebSocketLike {
  readyState: number;
  on(event: 'message', listener: (data: Buffer | string) => void): this;
  on(event: 'close', listener: (code: number, reason: Buffer) => void): this;
  on(event: 'error', listener: (error: Error) => void): this;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  on(event: string, listener: (...args: any[]) => void): this;
  send(data: string): void;
  close(): void;
}

export interface AudioFormat {
  encoding: 'audio/x-mulaw';
  sample_rate: 8000;
  channels: 1;
}

export interface MediaStreamBeginEvent {
  event: 'begin';
  call_id: string;
  account_id: string;
  audio_format: AudioFormat;
  /**
   * Media protocol version. Absent on servers older than 2.2, which do not
   * support `clear` or `mark`, and play audio as fast as it is sent rather
   * than at real time.
   */
  protocol_version?: string;
}

/**
 * Caller audio. `timestamp` is the chunk's media position in milliseconds
 * from session start.
 */
export interface MediaStreamAudioEvent {
  event: 'audio';
  timestamp: number;
  payload: string;
}

/**
 * Echo of a mark sent with {@link MediaStream.sendMark}: every chunk sent
 * before it has been played out, or was released by
 * {@link MediaStream.sendClear}. `timestamp` is when, in milliseconds from
 * session start.
 */
export interface MediaStreamMarkEvent {
  event: 'mark';
  name: string;
  timestamp: number;
}

/**
 * The queue of audio for the caller is full or nearly full; audio beyond its
 * 20-second limit is dropped. `timestamp` is when, in milliseconds from session
 * start.
 */
export interface MediaStreamOverflowEvent {
  event: 'overflow';
  timestamp: number;
}

/** Largest mark name the server accepts, in UTF-8 bytes. */
export const MAX_MARK_NAME_BYTES = 256;

/**
 * A key the caller pressed. `timestamp` shares the clock of `audio` events.
 */
export interface MediaStreamDtmfEvent {
  event: 'dtmf';
  timestamp: number;
  digit:
    '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '*' | '#' | 'A' | 'B' | 'C' | 'D';
}

export type MediaStreamMessage =
  MediaStreamBeginEvent | MediaStreamAudioEvent | MediaStreamDtmfEvent;

export interface MediaStreamEvents {
  begin: (event: MediaStreamBeginEvent) => void;
  audio: (event: MediaStreamAudioEvent) => void;
  dtmf: (event: MediaStreamDtmfEvent) => void;
  close: (code: number, reason: string) => void;
  error: (error: Error) => void;
}

/**
 * The events MediaStream emits. `mark` and `overflow` are kept out of the
 * exported `MediaStreamEvents` so existing code built on that map keeps
 * compiling.
 */
interface StreamEvents extends MediaStreamEvents {
  mark: (event: MediaStreamMarkEvent) => void;
  overflow: (event: MediaStreamOverflowEvent) => void;
}

// ============================================================================
// MediaStream Class
// ============================================================================

export class MediaStream extends EventEmitter {
  private ws: WebSocketLike;
  private _callId: string | null = null;
  private _accountId: string | null = null;
  private _audioFormat: AudioFormat | null = null;
  private _protocolVersion: string | null = null;

  constructor(ws: WebSocketLike) {
    super();
    this.ws = ws;
    this.setupListeners();
  }

  /**
   * Call ID (available after 'begin' event)
   */
  get callId(): string | null {
    return this._callId;
  }

  /**
   * Account ID (available after 'begin' event)
   */
  get accountId(): string | null {
    return this._accountId;
  }

  /**
   * Audio format specification (available after 'begin' event)
   */
  get audioFormat(): AudioFormat | null {
    return this._audioFormat;
  }

  /**
   * Media protocol version announced in 'begin', or null before it and on
   * servers older than 2.2.
   */
  get protocolVersion(): string | null {
    return this._protocolVersion;
  }

  private setupListeners(): void {
    this.ws.on('message', (data: Buffer | string) => {
      try {
        const message: MediaStreamMessage | MediaStreamMarkEvent | MediaStreamOverflowEvent =
          JSON.parse(typeof data === 'string' ? data : data.toString('utf8'));

        if (message.event === 'begin') {
          this._callId = message.call_id;
          this._accountId = message.account_id;
          this._audioFormat = message.audio_format;
          this._protocolVersion = message.protocol_version ?? null;
          this.emit('begin', message);
        } else if (message.event === 'audio') {
          this.emit('audio', message);
        } else if (message.event === 'dtmf') {
          this.emit('dtmf', message);
        } else if (message.event === 'mark') {
          this.emit('mark', message);
        } else if (message.event === 'overflow') {
          this.emit('overflow', message);
        }
      } catch (error) {
        this.emit('error', error as Error);
      }
    });

    this.ws.on('close', (code: number, reason: Buffer) => {
      this.emit('close', code, reason.toString('utf8'));
    });

    this.ws.on('error', (error: Error) => {
      this.emit('error', error);
    });
  }

  /**
   * Send audio to the caller, at any pace: the server plays it at real time,
   * in order, and queues up to 20 seconds of it. An 'overflow' event says the
   * queue filled and audio is being dropped.
   * @param payload Base64-encoded mulaw audio data
   */
  sendAudio(payload: string): void {
    this.send({ event: 'audio', payload });
  }

  /**
   * Send raw audio buffer to the caller (will be base64-encoded)
   * @param buffer Raw mulaw audio buffer
   */
  sendAudioBuffer(buffer: Buffer): void {
    this.sendAudio(buffer.toString('base64'));
  }

  /**
   * Drop every chunk of audio queued and not yet played, for example when
   * the caller talks over the agent. Pending marks are echoed at once.
   */
  sendClear(): void {
    this.send({ event: 'clear' });
  }

  /**
   * Ask to be told, through a 'mark' event with the same name, when every
   * chunk sent so far has been played out.
   * @throws RangeError when the name is longer than 256 UTF-8 bytes; the
   *   server would end the session.
   */
  sendMark(name: string): void {
    if (Buffer.byteLength(name, 'utf8') > MAX_MARK_NAME_BYTES) {
      throw new RangeError(`mark name exceeds ${MAX_MARK_NAME_BYTES} bytes`);
    }
    this.send({ event: 'mark', name });
  }

  private send(message: object): void {
    if (this.ws.readyState !== 1) {
      return;
    }
    this.ws.send(JSON.stringify(message));
  }

  /**
   * Close the media stream
   */
  close(): void {
    this.ws.close();
  }

  // Type-safe event emitter overrides
  on<K extends keyof MediaStreamEvents>(event: K, listener: MediaStreamEvents[K]): this;
  on(event: 'mark', listener: StreamEvents['mark']): this;
  on(event: 'overflow', listener: StreamEvents['overflow']): this;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  on(event: string, listener: (...args: any[]) => void): this {
    return super.on(event, listener);
  }

  once<K extends keyof MediaStreamEvents>(event: K, listener: MediaStreamEvents[K]): this;
  once(event: 'mark', listener: StreamEvents['mark']): this;
  once(event: 'overflow', listener: StreamEvents['overflow']): this;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  once(event: string, listener: (...args: any[]) => void): this {
    return super.once(event, listener);
  }

  off<K extends keyof MediaStreamEvents>(event: K, listener: MediaStreamEvents[K]): this;
  off(event: 'mark', listener: StreamEvents['mark']): this;
  off(event: 'overflow', listener: StreamEvents['overflow']): this;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  off(event: string, listener: (...args: any[]) => void): this {
    return super.off(event, listener);
  }

  emit<K extends keyof StreamEvents>(event: K, ...args: Parameters<StreamEvents[K]>): boolean {
    return super.emit(event, ...args);
  }
}
