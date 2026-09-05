import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { PIECES, pieceSrc } from "../src/stage/pieces.ts";

const STAGE = join(import.meta.dirname, "..", "public", "stage");

describe("the stage pieces", () => {
  it("every piece is a real file with a real size", () => {
    for (const [name, piece] of Object.entries(PIECES)) {
      const path = join(STAGE, piece.file);
      expect(existsSync(path), `${name} missing at ${path}`).toBe(true);
      expect(statSync(path).size).toBeGreaterThan(2_000);
      expect(piece.width).toBeGreaterThan(50);
      expect(piece.height).toBeGreaterThan(50);
    }
  });

  it("resolves to the public stage path", () => {
    expect(pieceSrc("saathi")).toBe("/stage/saathi.webp");
  });

  it("no piece is heavier than the page can afford", () => {
    for (const piece of Object.values(PIECES)) {
      expect(statSync(join(STAGE, piece.file)).size).toBeLessThan(420_000);
    }
  });
});
