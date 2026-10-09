// Tiny, dependency-free sample-rate conversion between the rates we care
// about:
//
//   8 kHz   — DialStack media WebSocket (after μ-law decode)
//   16 kHz  — ElevenLabs input, Gemini Live input
//   24 kHz  — Gemini Live output
//   any     — Telnyx output, set by the assistant's voice and only known at
//             runtime (Downsampler8k)
//
// These use linear interpolation / averaging rather than a proper polyphase
// filter. That is intentional: it keeps the example readable and dep-free,
// and the quality is fine for telephony bandwidth (which is already
// band-limited to ~3.4 kHz by the μ-law leg).
//
// If you adapt this for higher-fidelity use cases, swap in a real resampler
// (e.g. `node-libsamplerate`, with the caveat that it has a native build).

/** Upsample 8 kHz → 16 kHz by inserting one interpolated sample between each pair. */
export function upsample8kTo16k(pcm: Int16Array): Int16Array {
  const out = new Int16Array(pcm.length * 2);
  for (let i = 0; i < pcm.length; i++) {
    const a = pcm[i];
    const b = i + 1 < pcm.length ? pcm[i + 1] : a;
    out[i * 2] = a;
    out[i * 2 + 1] = (a + b) >> 1;
  }
  return out;
}

/** Downsample 16 kHz → 8 kHz by averaging each pair of samples. */
export function downsample16kTo8k(pcm: Int16Array): Int16Array {
  const outLen = pcm.length >> 1;
  const out = new Int16Array(outLen);
  for (let i = 0; i < outLen; i++) {
    out[i] = (pcm[i * 2] + pcm[i * 2 + 1]) >> 1;
  }
  return out;
}

/** Downsample 24 kHz → 8 kHz by averaging each group of three samples. */
export function downsample24kTo8k(pcm: Int16Array): Int16Array {
  const outLen = Math.floor(pcm.length / 3);
  const out = new Int16Array(outLen);
  for (let i = 0; i < outLen; i++) {
    out[i] = ((pcm[i * 3] + pcm[i * 3 + 1] + pcm[i * 3 + 2]) / 3) | 0;
  }
  return out;
}

/** Reinterpret a little-endian PCM16 byte buffer as Int16Array (no copy when aligned). */
export function bufferToPcm16(buf: Buffer): Int16Array {
  // Buffer is backed by ArrayBuffer; copy if misaligned (rare).
  if (buf.byteOffset % 2 === 0) {
    return new Int16Array(buf.buffer, buf.byteOffset, buf.byteLength >> 1);
  }
  const aligned = Buffer.from(buf);
  return new Int16Array(aligned.buffer, aligned.byteOffset, aligned.byteLength >> 1);
}

/** Pack Int16Array as a little-endian byte Buffer. */
export function pcm16ToBuffer(pcm: Int16Array): Buffer {
  return Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength);
}

/**
 * Streaming downsampler from any rate ≥ 8 kHz to 8 kHz, averaging each source
 * window. Keeps the leftover samples and the fractional window phase between
 * chunks, so non-integer ratios (22.05k, 44.1k) and chunk sizes that aren't a
 * multiple of the ratio neither drop samples nor click at chunk boundaries.
 */
export class Downsampler8k {
  private readonly ratio: number;
  private pending = new Int16Array(0);
  private phase = 0; // fractional start of the next window within `pending`

  constructor(fromRate: number) {
    if (fromRate < 8000) throw new Error(`cannot downsample from ${fromRate} Hz to 8000 Hz`);
    this.ratio = fromRate / 8000;
  }

  push(pcm: Int16Array): Int16Array {
    if (this.ratio === 1) return pcm;
    const buf = new Int16Array(this.pending.length + pcm.length);
    buf.set(this.pending);
    buf.set(pcm, this.pending.length);

    const out = new Int16Array(Math.floor((buf.length - this.phase) / this.ratio));
    let t = this.phase;
    for (let i = 0; i < out.length; i++, t += this.ratio) {
      const start = Math.floor(t);
      const end = Math.floor(t + this.ratio);
      let sum = 0;
      for (let j = start; j < end; j++) sum += buf[j];
      out[i] = (sum / (end - start)) | 0;
    }
    const consumed = Math.floor(t);
    this.pending = buf.slice(consumed);
    this.phase = t - consumed;
    return out;
  }
}
