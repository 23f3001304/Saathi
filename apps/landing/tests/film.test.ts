import { describe, expect, it } from "vitest";

import {
  anchorAt,
  ANCHORS,
  coverRect,
  inToutBox,
  isAnchorId,
} from "../src/film/anchors.ts";
import { seekWanted, targetTime } from "../src/film/film.ts";
import { remapAt, SCRIPT_FILM } from "../src/film/remap.ts";
import { requestedMode, showWindows } from "../src/show/mode.ts";
import { SCRIPT } from "../src/show/script.ts";

/** The knots the ruler is cut at: choreography time, then film time. */
const KNOTS: readonly (readonly [number, number])[] = [
  [0, 0],
  [0.075, 0.2],
  [0.335, 0.4],
  [0.53, 0.6],
  [0.695, 0.8],
  [1, 1],
];

describe("choreography time to film time", () => {
  it("lands every scene boundary exactly on its fifth", () => {
    for (const [from, to] of KNOTS) expect(remapAt(from)).toBe(to);
  });

  it("keeps the ends where they are, and clamps beyond them", () => {
    expect(remapAt(0)).toBe(0);
    expect(remapAt(1)).toBe(1);
    expect(remapAt(-0.4)).toBe(0);
    expect(remapAt(2)).toBe(1);
  });

  it("only ever moves forward", () => {
    let last = -1;
    for (let i = 0; i <= 1000; i += 1) {
      const next = remapAt(i / 1000);
      expect(next).toBeGreaterThan(last);
      last = next;
    }
  });

  it("runs straight between the knots", () => {
    expect(remapAt(0.0375)).toBeCloseTo(0.1, 10);
    expect(remapAt(0.205)).toBeCloseTo(0.3, 10);
  });

  it("hands the script over in order, on the film's clock", () => {
    expect(SCRIPT_FILM).toHaveLength(SCRIPT.length);
    SCRIPT_FILM.forEach((line, i) => {
      expect(line.id).toBe(SCRIPT[i].id);
      expect(line.text).toBe(SCRIPT[i].text);
      expect(line.at).toBe(remapAt(SCRIPT[i].at));
    });
  });
});

describe("the film on the canvas", () => {
  const film = { width: 1920, height: 1080 };

  it("fills a taller canvas and crops the sides, never letterboxing", () => {
    const rect = coverRect({ width: 1000, height: 1000 }, film);
    expect(rect.height).toBeCloseTo(1000, 6);
    expect(rect.width).toBeCloseTo(1777.78, 2);
    expect(rect.x).toBeLessThan(0);
    expect(rect.y).toBeCloseTo(0, 6);
    expect(rect.x + rect.width).toBeGreaterThanOrEqual(1000);
  });

  it("fills a wider canvas and crops the top and foot", () => {
    const rect = coverRect({ width: 1600, height: 600 }, film);
    expect(rect.width).toBeCloseTo(1600, 6);
    expect(rect.y).toBeLessThan(0);
    expect(rect.y + rect.height).toBeGreaterThanOrEqual(600);
  });

  it("stands still until the film has said how big it is", () => {
    const rect = coverRect({ width: 800, height: 600 }, { width: 0, height: 0 });
    expect(rect).toEqual({ x: 0, y: 0, width: 800, height: 600 });
  });
});

describe("where the puppets stand", () => {
  const rect = { x: 0, y: 0, width: 1000, height: 500 };

  it("knows its four, and nothing else", () => {
    expect(isAnchorId("saathi")).toBe(true);
    expect(isAnchorId("tout")).toBe(true);
    expect(isAnchorId("curtainLeft")).toBe(false);
    expect(Object.keys(ANCHORS)).toHaveLength(4);
  });

  it("reads a fraction of the frame as a place on the canvas", () => {
    const saathi = anchorAt(rect, "saathi");
    expect(saathi.x).toBeCloseTo(500, 9);
    expect(saathi.y).toBeCloseTo(200, 9);
    expect(anchorAt(rect, "shopper").x).toBeCloseTo(300, 9);
    expect(anchorAt(rect, "shopkeeper").x).toBeCloseTo(740, 9);
    expect(anchorAt(rect, "shopkeeper").y).toBeCloseTo(210, 9);
  });

  it("travels with the crop when the film hangs over the canvas", () => {
    const cropped = coverRect({ width: 500, height: 500 }, { width: 1000, height: 500 });
    expect(anchorAt(cropped, "saathi").x).toBeCloseTo(250, 10);
    expect(anchorAt(cropped, "shopper").x).toBeCloseTo(50, 10);
  });
});

describe("touching the tout", () => {
  const rect = { x: 0, y: 0, width: 1000, height: 500 };
  const centre = anchorAt(rect, "tout");

  it("answers on him, and at the corners of his box", () => {
    expect(inToutBox(rect, centre)).toBe(true);
    expect(inToutBox(rect, { x: centre.x + 109, y: centre.y + 99 })).toBe(true);
  });

  it("says nothing just outside it, across and up", () => {
    expect(inToutBox(rect, { x: centre.x + 111, y: centre.y })).toBe(false);
    expect(inToutBox(rect, { x: centre.x, y: centre.y - 101 })).toBe(false);
    expect(inToutBox(rect, anchorAt(rect, "shopper"))).toBe(false);
  });
});

describe("scrubbing the film", () => {
  it("stands where the reader is, and never outside the reel", () => {
    expect(targetTime(0.5, 40)).toBe(20);
    expect(targetTime(-1, 40)).toBe(0);
    expect(targetTime(2, 40)).toBe(40);
    expect(targetTime(0.5, Number.NaN)).toBe(0);
  });

  it("seeks only when the picture would move", () => {
    expect(seekWanted(0, -1)).toBe(true);
    expect(seekWanted(1, 1.02)).toBe(false);
    expect(seekWanted(1, 1.05)).toBe(true);
  });
});

describe("picking the picture", () => {
  it("gives a reader the film, and the query string the stage", () => {
    expect(requestedMode("")).toBe("film");
    expect(requestedMode("?sound=on")).toBe("film");
    expect(requestedMode("?stage")).toBe("stage");
    expect(requestedMode("?stage=1&sound=on")).toBe("stage");
  });

  it("hands every window out on one clock", () => {
    const film = showWindows("film");
    const stage = showWindows("stage");
    expect(film.script).toBe(SCRIPT_FILM);
    expect(stage.script).toBe(SCRIPT);
    expect(film.seal?.from).toBe(remapAt(stage.seal?.from ?? 0));
    expect(film.last?.at).toBe(remapAt(stage.last?.at ?? 0));
    expect(film.beginUntil).toBe(remapAt(stage.beginUntil));
    expect(film.tout).toEqual(stage.tout);
  });
});
