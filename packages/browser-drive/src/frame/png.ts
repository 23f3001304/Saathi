import { deflateSync, inflateSync } from "node:zlib";

import type { PngChunk } from "./png-chunks.js";
import {
  concat,
  PNG_SIGNATURE,
  PngFormatError,
  readChunks,
  readUint32,
  writeChunk,
  writeUint32,
} from "./png-chunks.js";

/** RGBA, 8 bits per channel, row-major, no padding. */
export interface RasterImage {
  readonly width: number;
  readonly height: number;
  readonly pixels: Uint8Array;
}

const RGB = 2;
const RGBA = 6;
/** Level 1: a frame is re-encoded twice a second, so speed beats bytes. */
const DEFLATE_LEVEL = 1;

interface Header {
  readonly width: number;
  readonly height: number;
  readonly channels: number;
}

function headerOf(chunks: readonly PngChunk[]): Header {
  const ihdr = chunks.find((chunk) => chunk.type === "IHDR");
  if (ihdr === undefined || ihdr.data.length < 13) {
    throw new PngFormatError("no IHDR");
  }
  const depth = ihdr.data[8];
  const colour = ihdr.data[9];
  const interlace = ihdr.data[12];
  if (depth !== 8 || interlace !== 0 || (colour !== RGB && colour !== RGBA)) {
    throw new PngFormatError(`depth ${depth}, colour ${colour}, interlace ${interlace}`);
  }
  return {
    width: readUint32(ihdr.data, 0),
    height: readUint32(ihdr.data, 4),
    channels: colour === RGBA ? 4 : 3,
  };
}

function predictor(filter: number, a: number, b: number, c: number): number {
  if (filter === 0) return 0;
  if (filter === 1) return a;
  if (filter === 2) return b;
  if (filter === 3) return (a + b) >> 1;
  if (filter === 4) return paeth(a, b, c);
  throw new PngFormatError(`filter type ${filter}`);
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

/** Off the left edge or off the top row reads as zero, per the spec. */
function byteAt(row: Uint8Array | null, index: number): number {
  return row === null || index < 0 ? 0 : (row[index] ?? 0);
}

function unfilterRow(
  filter: number,
  line: Uint8Array,
  dest: Uint8Array,
  prior: Uint8Array | null,
  bpp: number,
): void {
  for (let i = 0; i < line.length; i += 1) {
    dest[i] =
      (byteAt(line, i) +
        predictor(
          filter,
          byteAt(dest, i - bpp),
          byteAt(prior, i),
          byteAt(prior, i - bpp),
        )) &
      0xff;
  }
}

function unfilter(raw: Uint8Array, head: Header): Uint8Array {
  const stride = head.width * head.channels;
  const out = new Uint8Array(stride * head.height);
  if (raw.length < (stride + 1) * head.height) {
    throw new PngFormatError("the pixel stream is shorter than IHDR claims");
  }
  for (let y = 0; y < head.height; y += 1) {
    const at = y * (stride + 1);
    unfilterRow(
      raw[at] ?? 0,
      raw.subarray(at + 1, at + 1 + stride),
      out.subarray(y * stride, (y + 1) * stride),
      y === 0 ? null : out.subarray((y - 1) * stride, y * stride),
      head.channels,
    );
  }
  return out;
}

/** Widens RGB to RGBA so the rest of the frame path has one pixel layout. */
function toRgba(flat: Uint8Array, head: Header): Uint8Array {
  if (head.channels === 4) return flat;
  const out = new Uint8Array(head.width * head.height * 4);
  for (let px = 0; px < head.width * head.height; px += 1) {
    out[px * 4] = flat[px * 3] ?? 0;
    out[px * 4 + 1] = flat[px * 3 + 1] ?? 0;
    out[px * 4 + 2] = flat[px * 3 + 2] ?? 0;
    out[px * 4 + 3] = 255;
  }
  return out;
}

export function decodePng(bytes: Uint8Array): RasterImage {
  const chunks = readChunks(bytes);
  const head = headerOf(chunks);
  const idat = chunks.filter((chunk) => chunk.type === "IDAT");
  if (idat.length === 0) {
    throw new PngFormatError("no IDAT");
  }
  const raw = new Uint8Array(inflateSync(concat(idat.map((c) => c.data))));
  return {
    width: head.width,
    height: head.height,
    pixels: toRgba(unfilter(raw, head), head),
  };
}

function ihdrOf(image: RasterImage): Uint8Array {
  const data = new Uint8Array(13);
  writeUint32(data, 0, image.width);
  writeUint32(data, 4, image.height);
  data[8] = 8;
  data[9] = RGBA;
  return data;
}

/** Filter 0 on every row: nothing here is stored, so the cheap path wins. */
function filtered(image: RasterImage): Uint8Array {
  const stride = image.width * 4;
  const out = new Uint8Array((stride + 1) * image.height);
  for (let y = 0; y < image.height; y += 1) {
    out.set(image.pixels.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1);
  }
  return out;
}

export function encodePng(image: RasterImage): Uint8Array {
  const body = deflateSync(filtered(image), { level: DEFLATE_LEVEL });
  return concat([
    PNG_SIGNATURE,
    writeChunk("IHDR", ihdrOf(image)),
    writeChunk("IDAT", new Uint8Array(body)),
    writeChunk("IEND", new Uint8Array(0)),
  ]);
}

export { PngFormatError };
