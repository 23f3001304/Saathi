import { describe, expect, it } from "vitest";

import { STAGE } from "../src/show/contract.ts";
import { PIECES } from "../src/stage/pieces.ts";
import {
  anchorLift,
  easeToward,
  fovForAspect,
  headHeight,
  ndcToCss,
  nightMix,
  parallaxOffset,
  planeForHeight,
  planeForWidth,
} from "../src/webgl/math.ts";

describe("sizing a cutout", () => {
  it("keeps the artwork's own aspect when sized by height", () => {
    const puppet = planeForHeight(PIECES.saathi, 1.25);
    expect(puppet.height).toBe(1.25);
    expect(puppet.width / puppet.height).toBeCloseTo(PIECES.saathi.width / PIECES.saathi.height, 10);
  });

  it("keeps it when sized across instead, for the wide strips", () => {
    const strip = planeForWidth(PIECES.footlights, 3.2);
    expect(strip.width).toBe(3.2);
    expect(strip.width / strip.height).toBeCloseTo(PIECES.footlights.width / PIECES.footlights.height, 10);
  });

  it("puts a bottom anchored piece's feet on the mesh origin", () => {
    expect(anchorLift(1.25, "bottom")).toBe(0.625);
    expect(anchorLift(1.25, "centre")).toBe(0);
  });
});

describe("the lens", () => {
  it("narrows a wide screen until the proscenium is exactly its width", () => {
    expect(fovForAspect(16 / 9)).toBeCloseTo(26.8, 1);
    expect(fovForAspect(1.5)).toBeCloseTo(31.6, 1);
  });

  it("widens on a square or portrait screen, and stops at sixty-two degrees", () => {
    expect(fovForAspect(1)).toBeCloseTo(46, 0);
    expect(fovForAspect(0.4)).toBe(62);
  });

  it("survives a zero or missing height", () => {
    expect(fovForAspect(0)).toBe(STAGE.camera.fov);
    expect(fovForAspect(Number.NaN)).toBe(STAGE.camera.fov);
  });
});

describe("nightfall", () => {
  it("runs the day rig down to a twelfth and the night rig up", () => {
    expect(nightMix(0)).toEqual({ day: 1, night: 0 });
    expect(nightMix(1).day).toBeCloseTo(0.12, 10);
    expect(nightMix(1).night).toBe(1);
  });

  it("meets in the middle, and clamps whatever it is handed", () => {
    expect(nightMix(0.5).day).toBeCloseTo(0.56, 10);
    expect(nightMix(-3)).toEqual({ day: 1, night: 0 });
    expect(nightMix(9).night).toBe(1);
  });
});

describe("the camera's drift", () => {
  it("halves the gap in one half life, whatever the frame took", () => {
    expect(easeToward(0, 1, 90, 90)).toBeCloseTo(0.5, 10);
    expect(easeToward(0, 1, 45, 90)).toBeCloseTo(1 - Math.SQRT1_2, 10);
  });

  it("stands still on a frame of no time, and never overshoots", () => {
    expect(easeToward(0.3, 1, 0)).toBe(0.3);
    for (const dt of [16, 33, 120, 5000]) {
      const next = easeToward(0, 1, dt);
      expect(next).toBeGreaterThan(0);
      expect(next).toBeLessThan(1);
    }
  });

  it("offers the pointer a quarter unit sideways and less than half that up", () => {
    expect(parallaxOffset(1, 1)).toEqual({ x: 0.25, y: 0.12 });
    expect(parallaxOffset(-9, 9)).toEqual({ x: -0.25, y: 0.12 });
    expect(parallaxOffset(0, 0)).toEqual({ x: 0, y: 0 });
  });
});

describe("finding a head on the screen", () => {
  it("reads a puppet's head near the top of its own height", () => {
    expect(headHeight(1.25)).toBeCloseTo(1.15, 10);
  });

  it("turns device coordinates into CSS pixels, y down", () => {
    expect(ndcToCss(0, 0, 1440, 900)).toEqual({ x: 720, y: 450 });
    expect(ndcToCss(-1, 1, 1440, 900)).toEqual({ x: 0, y: 0 });
    expect(ndcToCss(1, -1, 1440, 900)).toEqual({ x: 1440, y: 900 });
  });
});
