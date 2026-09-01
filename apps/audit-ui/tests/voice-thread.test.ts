import { describe, expect, it } from "vitest";
import { arcRadius, listeningPath } from "../src/voice/listeningPath.ts";
import { IDLE, reduceVoice } from "../src/voice/voiceMachine.ts";

describe("the listening thread is drawn from real amplitude", () => {
  it("a louder sample bulges further, so a flat line means a dead mic", () => {
    // Same chord, bigger bulge, smaller radius: a fatter arc.
    expect(arcRadius(14, 8)).toBeLessThan(arcRadius(14, 1));
  });

  it("is one continuous stroke whose arcs alternate side", () => {
    const path = listeningPath([0, 0.5, 1, 0.2]);
    expect(path.startsWith("M 3 11")).toBe(true);

    // "A rx ry rotation large-arc sweep x y" — the sweep flag is what puts
    // the bulge above the line or below it.
    const arcs = path.split("A ").slice(1);
    expect(arcs).toHaveLength(4);
    const sweeps = arcs.map((arc) => arc.trim().split(/\s+/)[4]);
    expect(sweeps).toEqual(["1", "0", "1", "0"]);
  });

  it("survives a meter that reports nonsense", () => {
    expect(() => listeningPath([Number.NaN, 40, -3])).not.toThrow();
    expect(listeningPath([])).toBe("");
  });
});

describe("the machine only draws while it is actually listening", () => {
  it("ignores samples that arrive when nothing is being heard", () => {
    const next = reduceVoice(IDLE, { type: "level", level: 0.9 });
    expect(next).toBe(IDLE);
  });

  it("drops the wave when a batch engine moves on to transcribing", () => {
    const listening = reduceVoice(IDLE, { type: "start" });
    const loud = reduceVoice(listening, { type: "level", level: 1 });
    const settling = reduceVoice(loud, {
      type: "event",
      event: { kind: "transcribing" },
    });
    expect(settling.levels.every((level) => level === 0)).toBe(true);
  });
});
