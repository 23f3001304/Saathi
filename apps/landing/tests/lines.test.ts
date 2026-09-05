import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { LINES, lineFile } from "../src/sound/lines.ts";

describe("the voice lines", () => {
  it("every beat names files that exist", () => {
    for (const stems of Object.values(LINES)) {
      for (const stem of stems) {
        expect(
          existsSync(
            join(import.meta.dirname, "..", "public", "voice", `${stem}.mp3`),
          ),
          stem,
        ).toBe(true);
      }
    }
  });
  it("cycles the tout's tries", () => {
    expect(lineFile("refusal-tout", 0)).toBe("/voice/tout-refusal.mp3");
    expect(lineFile("refusal-tout", 3)).toBe("/voice/tout-refusal.mp3");
    expect(lineFile("refusal-tout", 1)).toBe("/voice/tout-again-1.mp3");
  });
});
