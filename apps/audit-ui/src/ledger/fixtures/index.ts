// Dev data (§9 build order step 2: "buildable before the gateway's stream
// exists") — every scenario the design calls for, plus a concatenated
// "full-demo" reel for `dev:fixtures`.
import type { LedgerFrame } from "../types.ts";
import { hexHash } from "./helpers.ts";
import { happyPurchaseFrames, HAPPY_TXN_ID } from "./happyPurchase.ts";
import { t1BlockFrames, T1_TXN_ID } from "./t1Block.ts";
import { replayBlockedFrames, REPLAY_TXN_ID } from "./replayBlocked.ts";
import { coolingOffFrames, COOLOFF_TXN_ID, COOLOFF_ID } from "./coolingOff.ts";
import { stage0BlockedFrames, STAGE0_TXN_ID } from "./stage0Blocked.ts";

export {
  HAPPY_TXN_ID,
  T1_TXN_ID,
  REPLAY_TXN_ID,
  COOLOFF_TXN_ID,
  COOLOFF_ID,
  STAGE0_TXN_ID,
};

function renumber(
  frames: LedgerFrame[],
  startId: number,
  startHash: string,
): { frames: LedgerFrame[]; nextId: number; nextHash: string } {
  let prevHash = startHash;
  const out = frames.map((frame, i) => {
    const id = startId + i;
    const thisHash = hexHash(id);
    const renumbered: LedgerFrame = {
      ...frame,
      id,
      prev_hash: prevHash,
      this_hash: thisHash,
    };
    prevHash = thisHash;
    return renumbered;
  });
  return { frames: out, nextId: startId + frames.length, nextHash: prevHash };
}

/** Re-sequences ids and re-chains hashes across scenarios stitched into one reel. */
export function concatScenarios(scenarios: LedgerFrame[][]): LedgerFrame[] {
  let id = 1;
  let hash = "0".repeat(64);
  const out: LedgerFrame[] = [];
  for (const scenario of scenarios) {
    const step = renumber(scenario, id, hash);
    out.push(...step.frames);
    id = step.nextId;
    hash = step.nextHash;
  }
  return out;
}

export const SCENARIOS: Record<string, () => LedgerFrame[]> = {
  "happy-purchase": happyPurchaseFrames,
  "t1-block": t1BlockFrames,
  "replay-blocked": replayBlockedFrames,
  "stage0-blocked": stage0BlockedFrames,
  "cooling-off": coolingOffFrames,
  "full-demo": () =>
    concatScenarios([
      happyPurchaseFrames(),
      t1BlockFrames(),
      coolingOffFrames(),
      replayBlockedFrames(),
      stage0BlockedFrames(),
    ]),
};

export function scenarioFrames(name: string): LedgerFrame[] {
  const build = SCENARIOS[name] ?? SCENARIOS["happy-purchase"];
  return build ? build() : [];
}
