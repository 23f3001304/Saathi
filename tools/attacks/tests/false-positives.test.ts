import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { runT1 } from "../src/attacks/t1.js";
import { runT27 } from "../src/attacks/t27.js";
import { runT31 } from "../src/attacks/t31.js";
import type { FpOutcome } from "../src/fp/index.js";
import { CORPUS_SIZE, runFalsePositives } from "../src/fp/index.js";
import { createHarness } from "../src/harness.js";
import { Transcript } from "../src/report/transcript.js";
import type { RunningGateway } from "./support/gateway-process.js";
import { startGatewayProcess } from "./support/gateway-process.js";

let gateway: RunningGateway;
let outcome: FpOutcome;

beforeAll(async () => {
  gateway = await startGatewayProcess();
  const harness = createHarness({
    gatewayUrl: gateway.url,
    keyDir: gateway.keyDir,
    tenantId: "tnt_demo",
  });
  const quiet = new Transcript(false);
  const attacks = [
    await runT1(harness, quiet),
    await runT31(harness, quiet),
    await runT27(harness, quiet),
  ];
  // `null` keeps the suite from rewriting the repo's RESULTS.md.
  outcome = await runFalsePositives(harness, quiet, attacks, { resultsPath: null });
}, 300_000);

afterAll(async () => {
  await gateway.stop();
});

describe("the benign corpus", () => {
  it("carries at least 40 legitimate scenarios", () => {
    expect(CORPUS_SIZE).toBeGreaterThanOrEqual(40);
    expect(outcome.scenarios).toHaveLength(CORPUS_SIZE);
  });

  it("runs every scenario against the live gateway", () => {
    expect(outcome.scenarios.every((s) => s.description.length > 0)).toBe(true);
    expect(outcome.matrix.benign).toBe(CORPUS_SIZE);
  });
});

describe("the confusion matrix", () => {
  it("lets no attack through", () => {
    expect(outcome.matrix.falseAllows).toBe(0);
    expect(outcome.matrix.recall).toBe(1);
  });

  it("keeps the purchase surface's false-positive rate at or below 10%", () => {
    const purchase = outcome.matrix.surfaces.find((row) => row.surface === "purchase");
    expect(purchase?.rate).toBeLessThanOrEqual(0.1);
  });

  it("attributes every false block to a named detector", () => {
    const blocked = outcome.scenarios.filter((s) => s.outcome === "blocked");
    expect(blocked.every((s) => s.detector !== null && s.cost !== null)).toBe(true);
  });

  // A corpus that nothing refuses is a corpus that measured nothing: this
  // guards the measurement, not the system.
  it("stresses the detectors hard enough to produce false blocks", () => {
    expect(outcome.matrix.falseBlocks).toBeGreaterThan(0);
    expect(outcome.matrix.trueAllows).toBeGreaterThan(outcome.matrix.falseBlocks);
  });

  it("renders a markdown report with the matrix in it", () => {
    expect(outcome.markdown).toContain("## Confusion matrix");
    expect(outcome.markdown).toContain("False-positive rate");
  });
});
