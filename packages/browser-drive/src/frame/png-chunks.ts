/**
 * PNG container plumbing: the signature, CRC32 and the chunk walk. Split from
 * the codec so `png.ts` reads as pixels rather than as byte arithmetic.
 *
 * DECISION: a hand-written codec rather than a dependency. Redaction has to
 * happen on the bytes in this process — an image library that is fine at
 * decoding is still one more package with a path to the frames it decodes, and
 * the frame path is the one place in this package where a leak is invisible.
 * The subset PNG needs here (8-bit, non-interlaced, what Chrome emits) is a
 * page of code; the rest of the format is refused rather than guessed at.
 */

export const PNG_SIGNATURE = Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10);

export class PngFormatError extends Error {
  constructor(what: string) {
    super(
      `This PNG is not one the sandbox frame path can redact (${what}). No frame is emitted rather than an unredacted one.`,
    );
    this.name = "PngFormatError";
  }
}

export interface PngChunk {
  readonly type: string;
  readonly data: Uint8Array;
}

const CRC_TABLE = buildCrcTable();

function buildCrcTable(): Uint32Array {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = (c & 1) === 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
}

export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = (CRC_TABLE[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function readUint32(bytes: Uint8Array, at: number): number {
  return (
    ((bytes[at] ?? 0) << 24) |
    ((bytes[at + 1] ?? 0) << 16) |
    ((bytes[at + 2] ?? 0) << 8) |
    (bytes[at + 3] ?? 0)
  ) >>> 0;
}

function writeUint32(into: Uint8Array, at: number, value: number): void {
  into[at] = (value >>> 24) & 0xff;
  into[at + 1] = (value >>> 16) & 0xff;
  into[at + 2] = (value >>> 8) & 0xff;
  into[at + 3] = value & 0xff;
}

function hasSignature(bytes: Uint8Array): boolean {
  return PNG_SIGNATURE.every((byte, index) => bytes[index] === byte);
}

/** Walks the chunk list. A truncated stream is a format error, not a guess. */
export function readChunks(bytes: Uint8Array): readonly PngChunk[] {
  if (bytes.length < PNG_SIGNATURE.length || !hasSignature(bytes)) {
    throw new PngFormatError("no PNG signature");
  }
  const chunks: PngChunk[] = [];
  let at = PNG_SIGNATURE.length;
  while (at + 8 <= bytes.length) {
    const length = readUint32(bytes, at);
    const end = at + 12 + length;
    if (end > bytes.length) {
      throw new PngFormatError("a chunk runs past the end of the stream");
    }
    chunks.push({
      type: String.fromCharCode(...bytes.subarray(at + 4, at + 8)),
      data: bytes.subarray(at + 8, at + 8 + length),
    });
    at = end;
  }
  return chunks;
}

export function writeChunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(data.length + 12);
  writeUint32(out, 0, data.length);
  for (let i = 0; i < 4; i += 1) {
    out[4 + i] = type.charCodeAt(i);
  }
  out.set(data, 8);
  writeUint32(out, out.length - 4, crc32(out.subarray(4, out.length - 4)));
  return out;
}

export function concat(parts: readonly Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

export { readUint32, writeUint32 };
