import type { MutableRefObject } from "react";
import type { ObjectId } from "./contract.ts";
import type { StageLike } from "./stage.ts";

/*
 * Where the speech card sits. The stage says where the speaker's head is in
 * CSS pixels; the card hangs above it so the tip of its paper tail lands
 * just short of the head, and then the whole card is pushed back inside the
 * viewport if it was about to leave. The card is measured only when its own
 * words or the window change, never in the middle of a frame.
 */

/** The tail's tip, measured in from the card's left edge. */
const TAIL_X = 28;
/** How far the tail hangs below the card: half a rotated 12px square. */
const TAIL_DROP = 8.5;
/** The gap the tip keeps above the head point. */
const GAP = 8;
/** How much of every edge of the viewport the card leaves alone. */
const MARGIN = 12;

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface Box {
  readonly w: number;
  readonly h: number;
}

/** A measured card, and the viewport width it was measured against. */
export interface Measured extends Box {
  readonly view: number;
}

export const UNMEASURED: Measured = { w: 0, h: 0, view: 0 };

function clamp(v: number, lo: number, hi: number): number {
  if (hi < lo) return lo;
  return v < lo ? lo : v > hi ? hi : v;
}

/** The card's top left, so its tail points at the head and it stays inside. */
export function cardAt(head: Point, card: Box, view: Box): Point {
  return {
    x: clamp(head.x - TAIL_X, MARGIN, view.w - MARGIN - card.w),
    y: clamp(
      head.y - GAP - TAIL_DROP - card.h,
      MARGIN,
      view.h - MARGIN - card.h,
    ),
  };
}

/** Parks the card over its puppet: one write, and a measure only when due. */
export function follow(
  card: HTMLElement | null,
  stage: StageLike,
  id: ObjectId | null,
  size: MutableRefObject<Measured>,
): void {
  if (card === null || id === null) return;
  const head = stage.screenPosition(id);
  if (head === null) return;
  const view = { w: window.innerWidth, h: window.innerHeight };
  if (size.current.w === 0 || size.current.view !== view.w) {
    size.current = { w: card.offsetWidth, h: card.offsetHeight, view: view.w };
  }
  const at = cardAt(head, size.current, view);
  card.style.transform = `translate(${at.x}px, ${at.y}px)`;
}
