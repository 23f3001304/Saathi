import { describe, expect, it } from "vitest";
import { cardAt } from "../src/show/bubble.ts";

/* The card hangs above the head it belongs to, and never leaves the frame:
   12px of every edge stays clear even when the speaker is standing in a
   corner, because a bubble half off the screen reads as a bug. */

const VIEW = { w: 1440, h: 900 };
const CARD = { w: 320, h: 96 };
const MARGIN = 12;

describe("the speech card", () => {
  it("hangs its tail over the head that is speaking", () => {
    const at = cardAt({ x: 700, y: 500 }, CARD, VIEW);
    expect(at.x + 28).toBe(700);
    expect(at.y + CARD.h + 8.5).toBe(500 - 8);
  });

  it("stays inside the frame when the speaker is in a corner", () => {
    const left = cardAt({ x: 4, y: 40 }, CARD, VIEW);
    expect(left.x).toBe(MARGIN);
    expect(left.y).toBe(MARGIN);
    const right = cardAt({ x: 1438, y: 890 }, CARD, VIEW);
    expect(right.x).toBe(VIEW.w - MARGIN - CARD.w);
    expect(right.y).toBeLessThanOrEqual(VIEW.h - MARGIN - CARD.h);
  });

  it("gives up the margin before it gives up the frame", () => {
    const at = cardAt({ x: 20, y: 20 }, { w: 2000, h: 2000 }, VIEW);
    expect(at.x).toBe(MARGIN);
    expect(at.y).toBe(MARGIN);
  });
});
