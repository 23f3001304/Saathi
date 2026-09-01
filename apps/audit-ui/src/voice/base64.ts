/**
 * Sarvam's sockets carry audio as base64 in JSON, in both directions. Chunked
 * rather than spread into `String.fromCharCode(...bytes)`, which throws on a
 * long argument list once an utterance gets big.
 */
const STRIDE = 0x8000;

export function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += STRIDE) {
    binary += String.fromCharCode(...bytes.subarray(i, i + STRIDE));
  }
  return btoa(binary);
}

export function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Float samples as the little-endian signed 16-bit PCM Sarvam documents. */
export function toLinear16(samples: Float32Array): Uint8Array {
  const buffer = new ArrayBuffer(samples.length * 2);
  const view = new DataView(buffer);
  for (let i = 0; i < samples.length; i += 1) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(i * 2, clamped * 0x7fff, true);
  }
  return new Uint8Array(buffer);
}
