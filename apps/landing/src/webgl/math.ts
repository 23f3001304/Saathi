/**
 * The stage's arithmetic, kept clear of WebGL so it can be read and tested in
 * node. Nothing in here touches three, the DOM or a canvas.
 */
import { STAGE } from "../show/contract.ts";

export interface PixelSize {
  readonly width: number;
  readonly height: number;
}

export interface PlaneSize {
  readonly width: number;
  readonly height: number;
}

export type Anchor = "bottom" | "centre";

/** A plane as tall as asked, as wide as the cutout's own pixels ask for. */
export function planeForHeight(pixels: PixelSize, heightMetres: number): PlaneSize {
  const aspect = pixels.width / pixels.height;
  return { width: heightMetres * aspect, height: heightMetres };
}

/** The same, for the wide strips (footlights, the slip) sized across. */
export function planeForWidth(pixels: PixelSize, widthMetres: number): PlaneSize {
  const aspect = pixels.height / pixels.width;
  return { width: widthMetres, height: widthMetres * aspect };
}

/** How far up the geometry moves so the anchor lands on the mesh origin. */
export function anchorLift(height: number, anchor: Anchor): number {
  return anchor === "bottom" ? height / 2 : 0;
}

export function clamp(value: number, low: number, high: number): number {
  if (value < low) return low;
  if (value > high) return high;
  return value;
}

export function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

export function lerp(from: number, to: number, t: number): number {
  return from + (to - from) * t;
}

/*
 * The picture fills the screen. The lens is set so the proscenium's own
 * width (3.9 units, 4.6 units in front of the camera) is exactly the width of
 * the screen: the card bleeds off the top and bottom on a wide screen and no
 * house shows at the sides. A tall screen would need a lens wider than 62
 * degrees for that, so it stops there and lets the frame overflow instead.
 */
const PROSCENIUM_HALF_WIDTH = 1.95;
const PROSCENIUM_DISTANCE = STAGE.camera.position[2] - STAGE.z.proscenium;

export function fovForAspect(aspect: number): number {
  if (!(aspect > 0)) return STAGE.camera.fov;
  const half = PROSCENIUM_HALF_WIDTH / aspect;
  const vertical = (2 * Math.atan(half / PROSCENIUM_DISTANCE) * 180) / Math.PI;
  return clamp(vertical, 22, 62);
}

/** Day falls to a twelfth at full night; the night rig rises the other way. */
export function nightMix(amount: number): { day: number; night: number } {
  const night = clamp01(amount);
  return { day: lerp(1, 0.12, night), night };
}

/**
 * Frame rate independent easing: the gap halves every `halfLifeMs`, whatever
 * the frame took, so a slow laptop drifts at the same speed as a fast one.
 */
export function easeToward(
  current: number,
  target: number,
  dtMs: number,
  halfLifeMs = 90,
): number {
  if (dtMs <= 0) return current;
  if (halfLifeMs <= 0) return target;
  const step = 1 - Math.pow(0.5, Math.min(dtMs, 200) / halfLifeMs);
  return current + (target - current) * step;
}

/** Normalised device coordinates to CSS pixels inside a canvas of this size. */
export function ndcToCss(
  ndcX: number,
  ndcY: number,
  width: number,
  height: number,
): { x: number; y: number } {
  return { x: (ndcX * 0.5 + 0.5) * width, y: (0.5 - ndcY * 0.5) * height };
}

/** A puppet's head, as a height above its base. */
export const HEAD_ANCHOR = 0.92;

export function headHeight(heightMetres: number): number {
  return heightMetres * HEAD_ANCHOR;
}

/** How far the camera drifts under the pointer, still facing the target. */
export function parallaxOffset(
  pointerX: number,
  pointerY: number,
): { x: number; y: number } {
  return { x: clamp(pointerX, -1, 1) * 0.25, y: clamp(pointerY, -1, 1) * 0.12 };
}
