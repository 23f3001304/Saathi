import type { AttackResult } from "./attacks/result.js";
import type { FpOutcome } from "./fp/index.js";
import { byDetector } from "./fp/matrix.js";
import type { Transcript } from "./report/transcript.js";
import type { ScenarioResult } from "./fp/types.js";

function pct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function matrixLines(outcome: FpOutcome): readonly string[] {
  const m = outcome.matrix;
  return [
    "                       allowed    held    blocked",
    `    attack  (n=${String(m.attacks).padStart(2)})     ${String(m.falseAllows).padStart(7)} ${"0".padStart(7)} ${String(m.trueBlocks).padStart(10)}`,
    `    benign  (n=${String(m.benign).padStart(2)})     ${String(m.trueAllows).padStart(7)} ${String(m.held).padStart(7)} ${String(m.falseBlocks).padStart(10)}`,
    "",
    `    false-positive rate  ${m.falseBlocks}/${m.benign} = ${pct(m.falsePositiveRate)}`,
    ...m.surfaces.map(
      (row) => `      on ${row.surface.padEnd(9)}      ${row.falseBlocks}/${row.total} = ${pct(row.rate)}`,
    ),
    `    attack recall        ${m.trueBlocks}/${m.attacks} = ${pct(m.recall)}`,
  ];
}

function costLine(scenario: ScenarioResult): string {
  return `    ${scenario.id.padEnd(5)} ${(scenario.detector ?? "-").padEnd(24)} ${(scenario.reasonCode ?? "-").padEnd(34)} ${scenario.cost ?? "-"}`;
}

function costSection(tx: Transcript, outcome: FpOutcome): void {
  tx.section("false blocks and their cost");
  const blocked = outcome.scenarios.filter((scenario) => scenario.outcome === "blocked");
  if (blocked.length === 0) {
    tx.raw("    none");
  }
  for (const scenario of blocked) {
    tx.raw(costLine(scenario));
  }
}

/** The number the demo lives or dies on, printed where nobody can miss it. */
export function printSummary(
  tx: Transcript,
  attacks: readonly AttackResult[],
  outcome: FpOutcome,
): void {
  tx.section("confusion matrix");
  tx.raw("");
  for (const line of matrixLines(outcome)) {
    tx.raw(line);
  }
  costSection(tx, outcome);
  tx.section("per-detector attribution");
  for (const row of byDetector(outcome.scenarios)) {
    tx.raw(`    ${row.detector.padEnd(24)} ${String(row.blocks).padStart(3)}  ${row.scenarios.join(", ")}`);
  }
  tx.section("attacks");
  for (const attack of attacks) {
    tx.result(attack.attackId, attack.blocked, `${attack.title} - ledger seq ${attack.ledgerSeq ?? "(none)"}`);
  }
  tx.raw("");
  if (outcome.resultsPath !== null) {
    tx.raw(`    written to ${outcome.resultsPath}`);
  }
  tx.raw("");
}
