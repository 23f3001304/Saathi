import type { WriteSpec } from "../flow/memory.js";
import type { PurchaseSpec } from "../flow/purchase.js";
import type { Harness } from "../harness.js";

/** The signed covenant every P3 write in the corpus presents as its channel sig. */
export interface ScenarioContext {
  readonly userId: string;
  readonly intentJwt: string;
  readonly intentJti: string;
  /** A merchant-signed attestation, minted per scenario for the P2 channel. */
  readonly merchantSig: string;
  readonly merchantJti: string;
}

export interface MemoryScenario {
  readonly id: string;
  readonly family: string;
  readonly description: string;
  /** Writes that must land before the scenario's own write is meaningful. */
  readonly seeds?: readonly ((context: ScenarioContext) => WriteSpec)[];
  readonly write: (context: ScenarioContext) => WriteSpec;
}

export interface PurchaseContext {
  readonly userId: string;
  /** Unique per scenario: envelope buckets are per (tenant, user, category). */
  readonly category: string;
}

export interface PurchaseScenario {
  readonly id: string;
  readonly family: string;
  readonly description: string;
  readonly build: (harness: Harness, context: PurchaseContext) => PurchaseSpec;
  /** A cool-off hold is the user's own rule working, not a block. */
  readonly expectHold?: boolean;
  /** Seeds a short-TTL quote first, so the scenario measures the re-quote. */
  readonly staleQuoteFirst?: boolean;
}

export type Outcome = "allowed" | "held" | "blocked";

export interface ScenarioResult {
  readonly id: string;
  readonly family: string;
  readonly description: string;
  readonly surface: "memory" | "purchase";
  readonly outcome: Outcome;
  readonly reasonCode: string | null;
  /** The rule or seal that fired: `R4.authority-claim`, `intent_bounds`, … */
  readonly detector: string | null;
  readonly remedy: string | null;
  readonly cost: FalsePositiveCost | null;
  readonly detail: string;
}

export type FalsePositiveCost =
  | "recoverable: re-quote"
  | "recoverable: merchant re-signs"
  | "recoverable: user re-signs the covenant"
  | "recoverable: wait or reduce"
  | "degraded: belief dropped, purchase unaffected"
  | "hard dead end";

export function isFalseBlock(result: ScenarioResult): boolean {
  return result.outcome === "blocked";
}
