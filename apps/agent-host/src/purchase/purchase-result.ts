import type { CheckoutOutcome, ToolCallDecision } from "@covenant/agents";

import type { AuditVerdict } from "./gateway-reader.js";
import type { MemoryWriteRecord } from "./tool-log.js";

/** `answered` is a turn the agent decided was conversation, not a purchase:
 *  no intent, no mandate, no ledger write, nothing to sign. */
export const RUN_STATUSES = [
  "running",
  "answered",
  "completed",
  "bounded",
  "failed",
] as const;

export type RunStatus = (typeof RUN_STATUSES)[number];

export interface IntentSummary {
  readonly mandateId: string;
  readonly description: string;
  readonly capPaise: number;
  readonly currency: string;
  readonly skus: readonly string[] | null;
  readonly requiresRefundability: boolean;
  readonly constraintIds: readonly string[];
}

export interface CartSummary {
  readonly cartId: string;
  readonly cartMandateId: string;
  readonly totalPaise: number;
  readonly sku: string;
  readonly quoteJti: string;
}

/**
 * The whole run, as one value. `/chat/state`, the CLI trail and the e2e all
 * read this: one account of what happened, so the browser and the terminal
 * cannot tell a judge two different stories about the same purchase.
 */
export interface PurchaseResult {
  readonly runId: string;
  readonly request: string;
  readonly status: RunStatus;
  readonly intent: IntentSummary | null;
  readonly memoryEntryIds: readonly string[];
  readonly memoryDigest: string | null;
  readonly memoryWrites: readonly MemoryWriteRecord[];
  readonly cart: CartSummary | null;
  /** The reason code the agent refused to propose a cart under (§8.4 check 1). */
  readonly cartRefusal: string | null;
  readonly verdicts: readonly AuditVerdict[];
  readonly chainOk: boolean | null;
  readonly outcome: CheckoutOutcome | null;
  readonly transcript: readonly string[];
  readonly blocked: readonly ToolCallDecision[];
  readonly failure: string | null;
}

export function emptyResult(runId: string, request: string): PurchaseResult {
  return {
    runId,
    request,
    status: "running",
    intent: null,
    memoryEntryIds: [],
    memoryDigest: null,
    memoryWrites: [],
    cart: null,
    cartRefusal: null,
    verdicts: [],
    chainOk: null,
    outcome: null,
    transcript: [],
    blocked: [],
    failure: null,
  };
}
