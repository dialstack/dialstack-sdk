/**
 * DialStack Media Stream
 *
 * Handles bidirectional audio streaming over WebSocket for voice apps.
 * DialStack connects to your WebSocket server when executing an `attach` action.
 *
 * @example
 * ```typescript
 * import { MediaStream } from '@dialstack/sdk/server';
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
}

export interface MediaStreamAudioEvent {
  event: 'audio';
  timestamp: number;
  payload: string;
}

export type MediaStreamMessage = MediaStreamBeginEvent | MediaStreamAudioEvent;

export interface MediaStreamEvents {
  begin: (event: MediaStreamBeginEvent) => void;
  audio: (event: MediaStreamAudioEvent) => void;
  close: (code: number, reason: string) => void;
  error: (error: Error) => void;
}

// ============================================================================
// MediaStream Class
// ============================================================================

export class MediaStream extends EventEmitter {
  private ws: WebSocketLike;
  private _callId: string | null = null;
  private _accountId: string | null = null;
  private _audioFormat: AudioFormat | null = null;

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

  private setupListeners(): void {
    this.ws.on('message', (data: Buffer | string) => {
      try {
        const message: MediaStreamMessage = JSON.parse(
          typeof data === 'string' ? data : data.toString('utf8')
        );

        if (message.event === 'begin') {
          this._callId = message.call_id;
          this._accountId = message.account_id;
          this._audioFormat = message.audio_format;
          this.emit('begin', message);
        } else if (message.event === 'audio') {
          this.emit('audio', message);
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
   * Send audio to the caller
   * @param payload Base64-encoded mulaw audio data
   */
  sendAudio(payload: string): void {
    if (this.ws.readyState !== 1) {
      return;
    }

    const message = JSON.stringify({
      event: 'audio',
      payload,
    });

    this.ws.send(message);
  }

  /**
   * Send raw audio buffer to the caller (will be base64-encoded)
   * @param buffer Raw mulaw audio buffer
   */
  sendAudioBuffer(buffer: Buffer): void {
    this.sendAudio(buffer.toString('base64'));
  }

  /**
   * Close the media stream
   */
  close(): void {
    this.ws.close();
  }

  // Type-safe event emitter overrides
  on<K extends keyof MediaStreamEvents>(
    event: K,
    listener: MediaStreamEvents[K]
  ): this {
    return super.on(event, listener);
  }

  once<K extends keyof MediaStreamEvents>(
    event: K,
    listener: MediaStreamEvents[K]
  ): this {
    return super.once(event, listener);
  }

  off<K extends keyof MediaStreamEvents>(
    event: K,
    listener: MediaStreamEvents[K]
  ): this {
    return super.off(event, listener);
  }

  emit<K extends keyof MediaStreamEvents>(
    event: K,
    ...args: Parameters<MediaStreamEvents[K]>
  ): boolean {
    return super.emit(event, ...args);
  }
}
