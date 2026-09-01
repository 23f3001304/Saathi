import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { AttackResult } from "../src/attacks/result.js";
import { runT1 } from "../src/attacks/t1.js";
import { runT27 } from "../src/attacks/t27.js";
import { runT31 } from "../src/attacks/t31.js";
import type { Harness } from "../src/harness.js";
import { createHarness, probeGateway } from "../src/harness.js";
import { Transcript } from "../src/report/transcript.js";
import type { RunningGateway } from "./support/gateway-process.js";
import { startGatewayProcess } from "./support/gateway-process.js";

let gateway: RunningGateway;
let harness: Harness;
const quiet = new Transcript(false);
const results = new Map<string, AttackResult>();

beforeAll(async () => {
  gateway = await startGatewayProcess();
  harness = createHarness({
    gatewayUrl: gateway.url,
    keyDir: gateway.keyDir,
    tenantId: "tnt_demo",
  });
  expect((await probeGateway(harness)).ok).toBe(true);
  for (const attack of [
    await runT1(harness, quiet),
    await runT31(harness, quiet),
    await runT27(harness, quiet),
  ]) {
    results.set(attack.attackId, attack);
  }
}, 300_000);

afterAll(async () => {
  await gateway.stop();
});

function resultFor(id: string): AttackResult {
  const found = results.get(id);
  if (found === undefined) {
    throw new Error(`no result for ${id}`);
  }
  return found;
}

describe("the three live attacks", () => {
  it.each(["T-1", "T-31", "T-27"])("blocks %s and ledgers it", (id) => {
    const result = resultFor(id);
    expect(result.notes).toEqual([]);
    expect(result.blocked).toBe(true);
    expect(result.ledgerSeq).not.toBeNull();
    expect(result.steps.every((step) => step.blocked)).toBe(true);
  });
});

describe("the reason codes each attack must answer with", () => {
  it("T-1 refuses the poisoned write at three independent gates", () => {
    expect(resultFor("T-1").steps.map((step) => step.reasonCode)).toEqual([
      "TIER_CLAIM_EXCEEDS_CHANNEL",
      "TYPE_REQUIRES_HIGHER_TIER",
      "PROTECTED_BOOLEAN_FLIP",
      "CONSTRAINT_RELAXATION_ATTEMPT",
      "CART_EXCEEDS_INTENT_CAP",
    ]);
  });

  it("T-31 answers NONCE_BURNED on the replay", () => {
    expect(resultFor("T-31").steps[0]?.reasonCode).toBe("NONCE_BURNED");
  });

  it("T-27 answers URI_DOWNGRADE and consumes nothing", () => {
    const steps = resultFor("T-27").steps;
    expect(steps[0]?.reasonCode).toBe("URI_DOWNGRADE");
    expect(steps[1]?.blocked).toBe(true);
  });
});
