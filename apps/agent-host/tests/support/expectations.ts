import type { ChatState } from "./drive.js";
import type { PurchaseResult } from "../../src/purchase/purchase-result.js";

export function resultOf(state: ChatState): PurchaseResult {
  const result = state.result;
  if (result === null) {
    throw new Error("the run produced no result");
  }
  return result;
}

export function rejectionCodes(state: ChatState): readonly string[] {
  return resultOf(state)
    .memoryWrites.filter((write) => write.status === "rejected")
    .map((write) => write.reasonCode ?? "");
}

/** The beat kinds `apps/audit-ui`'s Conversation tree renders today. */
export const UI_BEAT_KINDS: readonly string[] = [
  "intent-draft",
  "signing-required",
  "intent-signed",
  "message",
  "sort-key",
  "options",
  "cart",
  "outcome",
];

/** The gateway events a completed purchase must have left behind (§7.1). */
export const PAID_EVENT_KINDS: readonly string[] = [
  "verdict.emitted",
  "mandate.issued",
  "rzp.order.created",
  "rzp.link.created",
];
