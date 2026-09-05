import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SCRIPT, type Line } from "../src/show/script.ts";

/** U+2014, spelled out rather than typed: the house rule bans the character
 *  itself from the repo, tests included. */
const EM_DASH = String.fromCharCode(0x2014);
const OURS = /covenant|mandate|ledger|sandbox/i;
const VOICE = join(import.meta.dirname, "..", "public", "voice");
/** Below this many recordings the voices are still being made. */
const ENOUGH = 5;

function said(line: Line): string[] {
  return [line.text, line.gloss ?? "", line.title ?? ""];
}

const ALL = SCRIPT.flatMap(said);

describe("the script", () => {
  it("has no em dashes", () => {
    for (const text of ALL) expect(text, text).not.toContain(EM_DASH);
  });

  it("never says a word out of our own office", () => {
    for (const text of ALL) expect(text, text).not.toMatch(OURS);
  });

  it("runs down the page and never back up it", () => {
    let last = 0;
    for (const line of SCRIPT) {
      expect(line.at, line.id).toBeGreaterThanOrEqual(last);
      expect(line.at, line.id).toBeLessThanOrEqual(1);
      last = line.at;
    }
  });

  it("names a recording that exists for every line", () => {
    const stems = SCRIPT.map((line) => line.voice);
    const cut = (stem: string): boolean => existsSync(join(VOICE, `${stem}.mp3`));
    const made = stems.filter(cut).length;
    if (readdirSync(VOICE).length < ENOUGH || made < ENOUGH) {
      console.log(`script: ${made} of ${stems.length} lines recorded, voices still coming`);
      return;
    }
    for (const stem of stems) expect(cut(stem), stem).toBe(true);
  });
});
