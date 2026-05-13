// Tiny, dependency-free sample-rate conversion between the three rates we
// care about:
//
//   8 kHz   — DialStack media WebSocket (after μ-law decode)
//   16 kHz  — ElevenLabs input, Gemini Live input
//   24 kHz  — Gemini Live output
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
