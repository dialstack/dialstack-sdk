// μ-law (G.711) ⇄ linear PCM 16-bit conversion.
//
// DialStack streams audio as μ-law 8 kHz over the media WebSocket. Voice AI
// providers want linear PCM. We use the `alawmulaw` package, which is pure
// JS (no native deps — important for a publishable example).

import alawmulaw from 'alawmulaw';

const { mulaw } = alawmulaw;

/** Decode μ-law bytes into signed 16-bit PCM samples. */
export function mulawToPcm16(ulaw: Uint8Array): Int16Array {
  return mulaw.decode(ulaw);
}

/** Encode signed 16-bit PCM samples into μ-law bytes. */
export function pcm16ToMulaw(pcm: Int16Array): Uint8Array {
  return mulaw.encode(pcm);
}
