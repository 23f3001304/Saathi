import { describe, expect, it } from "vitest";
import {
  bloomPath,
  bloomPoints,
  petalCount,
  petalLevels,
  pulliRing,
} from "../src/voice/orbPath.ts";
import {
  currentLine,
  orbLabel,
  orbPhase,
  orbStatus,
  type SessionSignals,
} from "../src/voice/orbState.ts";
import { BAR_COUNT } from "../src/voice/voiceMachine.ts";

const CENTRE = { cx: 120, cy: 120, base: 84, reach: 22 };
const SILENT: readonly number[] = new Array<number>(BAR_COUNT).fill(0);

function radii(levels: readonly number[]): number[] {
  return bloomPoints(levels, CENTRE).map((p) =>
    Math.hypot(p.x - CENTRE.cx, p.y - CENTRE.cy),
  );
}

describe("orbPath — the bloom is drawn from real amplitude", () => {
  it("mirrors the sample window so the closed form has no seam", () => {
    const levels = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6];
    const petals = petalLevels(levels);

    expect(petalCount(levels.length)).toBe(12);
    expect(petals).toHaveLength(12);
    expect(petals.slice(0, 7)).toEqual(levels);
    // Walking on past the newest sample walks back down the same window.
    expect(petals.slice(7)).toEqual([0.5, 0.4, 0.3, 0.2, 0.1]);
  });

  it("draws a plain ring at silence rather than a dead flat shape", () => {
    for (const r of radii(SILENT)) expect(r).toBeCloseTo(CENTRE.base, 6);
  });

  it("pushes a petal further out the louder that sample was", () => {
    const quiet = radii(SILENT);
    const loud = radii([0, 0, 0, 1, 0, 0, 0]);
    expect(loud[3]).toBeGreaterThan(quiet[3]);
    expect(loud[3]).toBeCloseTo(CENTRE.base + CENTRE.reach, 6);
    expect(loud[0]).toBeCloseTo(CENTRE.base, 6);
  });

  it("clamps nonsense samples instead of drawing NaN", () => {
    const path = bloomPath([2, -1, Number.NaN, 0.5, 0, 0, 0], CENTRE);
    expect(path).not.toContain("NaN");
    expect(radii([2, 0, 0, 0, 0, 0, 0])[0]).toBeCloseTo(
      CENTRE.base + CENTRE.reach,
      6,
    );
  });
});

describe("orbPath — one closed stroke around its pulli", () => {
  it("is one continuous closed stroke, never a lifted hand", () => {
    const path = bloomPath(SILENT, CENTRE);
    expect(path.startsWith("M ")).toBe(true);
    expect(path.endsWith(" Z")).toBe(true);
    expect(path.match(/M/g)).toHaveLength(1);
    expect(path.match(/C/g)).toHaveLength(12);
  });

  it("sets one pulli per petal, all on the same ring", () => {
    const ring = pulliRing(12, 120, 120, 112);
    expect(ring).toHaveLength(12);
    for (const p of ring) {
      expect(Math.hypot(p.x - 120, p.y - 120)).toBeCloseTo(112, 6);
    }
  });
});

function signals(over: Partial<SessionSignals>): SessionSignals {
  return {
    listening: false,
    transcribing: false,
    awaiting: false,
    speaking: false,
    ...over,
  };
}

describe("orbState — four states, and the words for each", () => {
  it("names idle, listening, thinking and speaking distinctly", () => {
    expect(orbPhase(signals({}))).toBe("idle");
    expect(orbPhase(signals({ listening: true }))).toBe("listening");
    expect(orbPhase(signals({ transcribing: true }))).toBe("thinking");
    expect(orbPhase(signals({ awaiting: true }))).toBe("thinking");
    expect(orbPhase(signals({ speaking: true }))).toBe("speaking");
  });

  it("holds speaking through a barge-in rather than flickering", () => {
    const both = signals({ speaking: true, listening: true });
    expect(orbPhase(both)).toBe("speaking");
  });
});

describe("orbState — the words for each state", () => {
  it("gives every state a sentence and a press", () => {
    const phases = ["idle", "listening", "thinking", "speaking"] as const;
    const said = phases.map(orbStatus);
    expect(new Set(said).size).toBe(phases.length);
    expect(said.every((s) => s !== "")).toBe(true);
    expect(new Set(phases.map(orbLabel)).size).toBe(phases.length);
    expect(orbStatus("idle")).toBe("Ready — tap the bloom and speak");
    expect(orbStatus("listening")).toBe("Listening");
    expect(orbStatus("thinking")).toBe("Working out what you said");
    expect(orbStatus("speaking")).toBe("Speaking");
  });

  it("shows a guess quietly and what was said in full ink", () => {
    const parts = { interim: "do kilo", heard: "do kilo chawal", reply: "" };
    expect(currentLine("listening", parts)).toEqual({
      text: "do kilo",
      tone: "quiet",
    });
    expect(currentLine("thinking", parts)).toEqual({
      text: "do kilo chawal",
      tone: "ink",
    });
  });

  it("hands the same place over to the agent's line when it answers", () => {
    const parts = { interim: "", heard: "two kilos", reply: "Rice, ₹96." };
    expect(currentLine("speaking", parts).text).toBe("Rice, ₹96.");
    expect(currentLine("idle", { ...parts, reply: "" }).text).toBe("two kilos");
  });
});
