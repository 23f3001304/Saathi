import { describe, expect, it } from "vitest";
import { HIDDEN, type Choreography, type Pose } from "../src/show/contract.ts";
import { evaluate } from "../src/show/evaluate.ts";

/** The one object under test, so every case reads as one track of a show. */
function poseAt(show: Choreography, progress: number): Pose {
  const got = evaluate(show, progress).saathi;
  if (got === undefined) throw new Error("the track drew no pose");
  return got;
}

const FROM = { x: 0, y: 0, z: 0, rot: 0, scale: 1, opacity: 0 };

const walk: Choreography = {
  saathi: [
    { at: 0.2, pose: FROM },
    { at: 0.4, pose: { x: 1, opacity: 1 }, ease: "linear" },
  ],
};

const popped: Choreography = {
  saathi: [
    { at: 0, pose: FROM },
    { at: 1, pose: { x: 1, opacity: 1 }, ease: "pop" },
  ],
};

const snapped: Choreography = {
  saathi: [
    { at: 0.2, pose: FROM },
    { at: 0.6, pose: { x: 1, opacity: 1 }, ease: "snap" },
  ],
};

describe("the show at a scroll position", () => {
  it("holds an object off stage until its first keyframe", () => {
    expect(poseAt(walk, 0)).toEqual(HIDDEN);
    expect(poseAt(walk, 0.199)).toEqual(HIDDEN);
    expect(poseAt(walk, 0.2)).toEqual(FROM);
  });

  it("walks a linear keyframe halfway at halfway", () => {
    const mid = poseAt(walk, 0.3);
    expect(mid.x).toBeCloseTo(0.5, 6);
    expect(mid.opacity).toBeCloseTo(0.5, 6);
    expect(mid.scale).toBe(1);
  });

  it("lets pop overshoot the position but never the opacity", () => {
    const late = poseAt(popped, 0.6);
    expect(late.x).toBeGreaterThan(1);
    expect(late.opacity).toBe(1);
    expect(poseAt(popped, 1).x).toBeCloseTo(1, 6);
  });

  it("makes snap hold the old pose until the keyframe itself", () => {
    expect(poseAt(snapped, 0.4)).toEqual(FROM);
    expect(poseAt(snapped, 0.599)).toEqual(FROM);
    expect(poseAt(snapped, 0.6).x).toBe(1);
  });

  it("holds the last pose to the end of the page", () => {
    const last = poseAt(walk, 0.4);
    expect(poseAt(walk, 0.75)).toEqual(last);
    expect(poseAt(walk, 1)).toEqual(last);
  });

  it("inherits every field a keyframe does not mention", () => {
    const end = poseAt(walk, 1);
    expect(end).toEqual({ ...FROM, x: 1, opacity: 1 });
  });
});
