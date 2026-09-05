import { describe, expect, it } from "vitest";
import { settled, step, tilt, type Spring } from "../src/motion/stickSpring.ts";

function run(from: number, to: number, frames: number, dt = 16): Spring[] {
  const out: Spring[] = [];
  let s: Spring = { x: from, v: 0 };
  for (let i = 0; i < frames; i += 1) { s = step(s, to, dt); out.push(s); }
  return out;
}

describe("the stick spring", () => {
  it("arrives and settles within a second and a half", () => {
    const path = run(20, 70, 90);
    expect(settled(path[path.length - 1]!, 70)).toBe(true);
  });

  it("overshoots once, like a hand stopping a stick, not more", () => {
    const path = run(20, 70, 120);
    let crossings = 0;
    let above = false;
    for (const s of path) {
      const nowAbove = s.x > 70;
      if (nowAbove !== above) { crossings += 1; above = nowAbove; }
    }
    expect(crossings).toBeGreaterThanOrEqual(1);
    expect(crossings).toBeLessThanOrEqual(2);
  });

  it("never diverges on a frame that took too long", () => {
    let s: Spring = { x: 0, v: 0 };
    for (let i = 0; i < 40; i += 1) s = step(s, 90, 900);
    expect(Math.abs(s.x)).toBeLessThan(200);
    expect(Number.isFinite(s.v)).toBe(true);
  });

  it("tilts with velocity and never past nine degrees", () => {
    expect(tilt(0)).toBe(0);
    expect(tilt(40)).toBeGreaterThan(0);
    expect(tilt(4000)).toBe(9);
    expect(tilt(-4000)).toBe(-9);
  });
});
