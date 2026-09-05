/**
 * Where things stand in the film, and how the film sits on the canvas.
 *
 * A film has no geometry behind it, so the four puppets are named by where
 * they stand in the frame, as fractions of the film's own rectangle. That
 * rectangle is cover fitted: the picture fills the canvas and the overflow
 * is cropped away, never letterboxed, so the fractions travel with the crop
 * and a speech card still lands over the mouth that is talking.
 */

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface Size {
  readonly width: number;
  readonly height: number;
}

export interface Rect extends Point, Size {}

/** The four the story can point at. Everything else has no place on screen. */
export type AnchorId = "saathi" | "shopper" | "shopkeeper" | "tout";

export const ANCHORS: Readonly<Record<AnchorId, Point>> = {
  saathi: { x: 0.5, y: 0.4 },
  shopper: { x: 0.3, y: 0.4 },
  shopkeeper: { x: 0.74, y: 0.42 },
  tout: { x: 0.72, y: 0.38 },
};

/** The tout's patch of the picture, as a share of the frame. */
export const TOUT_BOX: Size = { width: 0.22, height: 0.4 };

const IDS: readonly string[] = Object.keys(ANCHORS);

export function isAnchorId(id: string): id is AnchorId {
  return IDS.includes(id);
}

/** The film's rectangle over the canvas: fill it, crop what hangs over. */
export function coverRect(canvas: Size, film: Size): Rect {
  if (film.width <= 0 || film.height <= 0) {
    return { x: 0, y: 0, width: canvas.width, height: canvas.height };
  }
  const scale = Math.max(
    canvas.width / film.width,
    canvas.height / film.height,
  );
  const width = film.width * scale;
  const height = film.height * scale;
  return {
    x: (canvas.width - width) / 2,
    y: (canvas.height - height) / 2,
    width,
    height,
  };
}

/** A puppet's place on the canvas, in the same pixels the page is drawn in. */
export function anchorAt(rect: Rect, id: AnchorId): Point {
  const at = ANCHORS[id];
  return { x: rect.x + at.x * rect.width, y: rect.y + at.y * rect.height };
}

/** Is this point on the tout: the one thing in the picture you can touch. */
export function inToutBox(rect: Rect, point: Point): boolean {
  const centre = anchorAt(rect, "tout");
  const halfWidth = (TOUT_BOX.width * rect.width) / 2;
  const halfHeight = (TOUT_BOX.height * rect.height) / 2;
  return (
    Math.abs(point.x - centre.x) <= halfWidth &&
    Math.abs(point.y - centre.y) <= halfHeight
  );
}
