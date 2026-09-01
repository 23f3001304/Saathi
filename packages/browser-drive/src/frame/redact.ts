import type { Rect } from "../ports.js";
import type { RasterImage } from "./png.js";

/** Opaque near-black. Not a blur: a blur is a picture of the secret. */
export const REDACTION_RGBA = Uint8Array.of(12, 12, 14, 255);

/**
 * Grown outward before painting. Sub-pixel layout, focus rings and text
 * antialiasing all bleed a pixel or two past `getBoundingClientRect`, and a
 * one-pixel sliver of a six-digit OTP is still four of its digits.
 */
export const REDACTION_PAD_PX = 3;

interface Bounds {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

/** Outward rounding, then clamped to the image: never smaller than the rect. */
function boundsOf(rect: Rect, width: number, height: number): Bounds | null {
  // A box with no area draws no pixels, so there is no antialiasing to grow
  // outward over and nothing of the field to cover. Padding one anyway put a
  // 3x3 smudge at the origin for every `display:none` sign-in form on the
  // page — pixels of something else, painted in the name of a field that was
  // never rendered. Declining here is also what lets the screencast's fast
  // path survive a site whose header holds a collapsed login box.
  if (rect.width <= 0 || rect.height <= 0) return null;
  const left = Math.max(0, Math.floor(rect.x) - REDACTION_PAD_PX);
  const top = Math.max(0, Math.floor(rect.y) - REDACTION_PAD_PX);
  const right = Math.min(
    width,
    Math.ceil(rect.x + rect.width) + REDACTION_PAD_PX,
  );
  const bottom = Math.min(
    height,
    Math.ceil(rect.y + rect.height) + REDACTION_PAD_PX,
  );
  return right <= left || bottom <= top ? null : { left, top, right, bottom };
}

/**
 * Whether this rect would actually paint anything on a frame of this size.
 *
 * The screencast path asks this before deciding a frame needs no repainting,
 * so it must be the same question `paintRects` answers by painting — hence one
 * `boundsOf` and two callers. A page whose header holds a collapsed sign-in
 * form reports a real password field at a zero-area, off-viewport box: it is
 * sensitive, it is correctly classified, and there is no pixel of it on the
 * frame. Treating that as "must repaint" would drop every such page to the
 * slow path for nothing, and treating it as paintable would be a lie about
 * what was painted.
 */
export function paints(rect: Rect, width: number, height: number): boolean {
  return boundsOf(rect, width, height) !== null;
}

function fill(image: RasterImage, at: Bounds): void {
  for (let y = at.top; y < at.bottom; y += 1) {
    const row = y * image.width * 4;
    for (let x = at.left; x < at.right; x += 1) {
      image.pixels.set(REDACTION_RGBA, row + x * 4);
    }
  }
}

/**
 * Blanks the given boxes in place. Called between decode and encode, so the
 * pixels never exist in any frame that leaves this process — the redaction is
 * not a CSS overlay the page could have refused to render, and not a viewer-
 * side mask a client could switch off.
 */
export function paintRects(image: RasterImage, rects: readonly Rect[]): number {
  let painted = 0;
  for (const rect of rects) {
    const at = boundsOf(rect, image.width, image.height);
    if (at === null) continue;
    fill(image, at);
    painted += 1;
  }
  return painted;
}
