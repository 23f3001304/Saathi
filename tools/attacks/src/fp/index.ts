import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { AttackResult } from "../attacks/result.js";
import type { Harness } from "../harness.js";
import type { Transcript } from "../report/transcript.js";
import { CATALOG_SCENARIOS } from "./corpus-catalog.js";
import { ATTESTED_SCENARIOS } from "./corpus-attested.js";
import { CONSTRAINT_SCENARIOS } from "./corpus-constraints.js";
import { PURCHASE_SCENARIOS } from "./corpus-purchase.js";
import type { Matrix } from "./matrix.js";
import { buildMatrix } from "./matrix.js";
import { findingsFor } from "./findings.js";
import { markdownReport } from "./report.js";
import { runMemoryScenarios } from "./run-memory.js";
import { runPurchaseScenarios } from "./run-purchase.js";
import type { MemoryScenario, ScenarioResult } from "./types.js";

const MEMORY_CORPUS: readonly MemoryScenario[] = [
  ...CATALOG_SCENARIOS,
  ...ATTESTED_SCENARIOS,
  ...CONSTRAINT_SCENARIOS,
];

export const CORPUS_SIZE = MEMORY_CORPUS.length + PURCHASE_SCENARIOS.length;

/** Walks up to the package root so the file lands beside `package.json`. */
function packageRoot(): string {
  let cursor = dirname(fileURLToPath(import.meta.url));
  for (;;) {
    const manifest = join(cursor, "package.json");
    if (existsSync(manifest)) {
      const name = (JSON.parse(readFileSync(manifest, "utf8")) as { name?: string }).name;
      if (name === "@covenant/attacks") {
        return cursor;
      }
    }
    const parent = dirname(cursor);
    if (parent === cursor) {
      throw new Error("could not locate the @covenant/attacks package root");
    }
    cursor = parent;
  }
}

export interface FpOutcome {
  readonly matrix: Matrix;
  readonly scenarios: readonly ScenarioResult[];
  readonly markdown: string;
  readonly resultsPath: string | null;
}

export interface FpOptions {
  /** `null` writes no file — the CI suite measures without touching the repo. */
  readonly resultsPath?: string | null;
}

/**
 * The metric almost no submission volunteers. Benign scenarios are designed to
 * *stress* the detectors — trigger-ish catalog copy, boundary amounts,
 * tightening edits — because a false-positive rate measured on easy inputs is
 * a number about the corpus, not about the system.
 */
export async function runFalsePositives(
  harness: Harness,
  tx: Transcript,
  attacks: readonly AttackResult[],
  options: FpOptions = {},
): Promise<FpOutcome> {
  tx.banner("FP", "benign corpus", `${CORPUS_SIZE} legitimate scenarios, run against the live gateway.`);
  tx.section("memory writes");
  const memory = await runMemoryScenarios(harness, MEMORY_CORPUS, tx);
  tx.section("purchases");
  const purchases = await runPurchaseScenarios(harness, PURCHASE_SCENARIOS, tx);
  const scenarios = [...memory, ...purchases];
  const matrix = buildMatrix(attacks, scenarios);
  const markdown = markdownReport({
    matrix,
    attacks,
    scenarios,
    generatedAt: new Date().toISOString(),
    notes: findingsFor(scenarios),
  });
  const resultsPath =
    options.resultsPath === undefined ? join(packageRoot(), "RESULTS.md") : options.resultsPath;
  if (resultsPath !== null) {
    writeFileSync(resultsPath, `${markdown}\n`, "utf8");
  }
  return { matrix, scenarios, markdown, resultsPath };
}
