import type { AttackResult } from "../attacks/result.js";
import type { ScenarioResult } from "./types.js";

export interface Matrix {
  readonly attacks: number;
  readonly trueBlocks: number;
  /** An attack that got through. Any value above zero is a build failure. */
  readonly falseAllows: number;
  readonly benign: number;
  readonly trueAllows: number;
  readonly held: number;
  readonly falseBlocks: number;
  readonly falsePositiveRate: number;
  readonly recall: number;
  readonly surfaces: readonly SurfaceRow[];
}

export interface SurfaceRow {
  readonly surface: "memory" | "purchase";
  readonly total: number;
  readonly falseBlocks: number;
  readonly rate: number;
}

function ratio(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : numerator / denominator;
}

/**
 * The headline rate mixes two very different costs, so it is also split. A
 * refused catalog line drops a belief the read gate would have withheld from
 * cart construction anyway; a refused cart stops a purchase.
 */
function surfacesOf(scenarios: readonly ScenarioResult[]): readonly SurfaceRow[] {
  const surfaces: readonly ("memory" | "purchase")[] = ["memory", "purchase"];
  return surfaces.map((surface) => {
    const rows = scenarios.filter((scenario) => scenario.surface === surface);
    const falseBlocks = rows.filter((row) => row.outcome === "blocked").length;
    return {
      surface,
      total: rows.length,
      falseBlocks,
      rate: ratio(falseBlocks, rows.length),
    };
  });
}

/**
 * A cool-off `hold` counts as an allow. It is the user's own precommitment
 * firing, the purchase completes after the window or on one tap, and scoring
 * it as a block would inflate the false-positive rate with the one outcome
 * the design is proudest of.
 */
export function buildMatrix(
  attacks: readonly AttackResult[],
  scenarios: readonly ScenarioResult[],
): Matrix {
  const trueBlocks = attacks.filter((attack) => attack.blocked).length;
  const falseBlocks = scenarios.filter((s) => s.outcome === "blocked").length;
  const held = scenarios.filter((s) => s.outcome === "held").length;
  const trueAllows = scenarios.filter((s) => s.outcome === "allowed").length;
  return {
    attacks: attacks.length,
    trueBlocks,
    falseAllows: attacks.length - trueBlocks,
    benign: scenarios.length,
    trueAllows,
    held,
    falseBlocks,
    falsePositiveRate: ratio(falseBlocks, scenarios.length),
    recall: ratio(trueBlocks, attacks.length),
    surfaces: surfacesOf(scenarios),
  };
}

export interface DetectorRow {
  readonly detector: string;
  readonly blocks: number;
  readonly scenarios: readonly string[];
  readonly reasonCodes: readonly string[];
}

export function byDetector(
  scenarios: readonly ScenarioResult[],
): readonly DetectorRow[] {
  const rows = new Map<string, { ids: string[]; codes: Set<string> }>();
  for (const scenario of scenarios) {
    if (scenario.outcome !== "blocked") {
      continue;
    }
    const key = scenario.detector ?? "(unattributed)";
    const row = rows.get(key) ?? { ids: [], codes: new Set<string>() };
    row.ids.push(scenario.id);
    row.codes.add(scenario.reasonCode ?? "(none)");
    rows.set(key, row);
  }
  return [...rows.entries()]
    .map(([detector, row]) => ({
      detector,
      blocks: row.ids.length,
      scenarios: row.ids,
      reasonCodes: [...row.codes],
    }))
    .sort((left, right) => right.blocks - left.blocks);
}

export interface FamilyRow {
  readonly family: string;
  readonly total: number;
  readonly blocked: number;
}

export function byFamily(
  scenarios: readonly ScenarioResult[],
): readonly FamilyRow[] {
  const rows = new Map<string, { total: number; blocked: number }>();
  for (const scenario of scenarios) {
    const row = rows.get(scenario.family) ?? { total: 0, blocked: 0 };
    row.total += 1;
    row.blocked += scenario.outcome === "blocked" ? 1 : 0;
    rows.set(scenario.family, row);
  }
  return [...rows.entries()].map(([family, row]) => ({ family, ...row }));
}
