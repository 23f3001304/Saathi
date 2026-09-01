import type { PurchaseResult } from "./purchase-result.js";
import type { MemoryWriteRecord } from "./tool-log.js";
import { majorUnits } from "./payment-request.js";

function row(label: string, detail: string): string {
  return `${label.padEnd(9)}${detail}`;
}

function intentRow(result: PurchaseResult): readonly string[] {
  const intent = result.intent;
  if (intent === null) {
    return [row("intent", "not signed")];
  }
  return [
    row(
      "intent",
      `${intent.mandateId} · cap ${intent.currency} ${majorUnits(intent.capPaise)} · skus ${
        intent.skus?.join(", ") ?? "any"
      } · refundable ${intent.requiresRefundability ? "required" : "optional"}`,
    ),
    row("", `${intent.constraintIds.length} P3 constraints committed`),
  ];
}

function memoryRow(write: MemoryWriteRecord): string {
  const suffix =
    write.status === "rejected"
      ? `${write.reasonCode ?? "?"} · rule ${write.rule ?? "stage-1"}`
      : `${write.tierGranted ?? "?"} · ${write.memoryId ?? "?"}`;
  return row("memory", `${write.status.padEnd(11)} ${write.type} ${write.channel} → ${suffix}`);
}

function cartRows(result: PurchaseResult): readonly string[] {
  if (result.cart === null) {
    return [
      row("cart", `refused: ${result.cartRefusal ?? "not proposed"} — the cart stayed inside the signed bounds`),
    ];
  }
  return [
    row(
      "cart",
      `${result.cart.cartMandateId} · ${result.cart.sku} · INR ${majorUnits(result.cart.totalPaise)}`,
    ),
    row("", `digest ${result.memoryDigest ?? "none"} over ${result.memoryEntryIds.length} entries`),
    row("", `quote ${result.cart.quoteJti}`),
  ];
}

/**
 * An empty list is reported two different ways on purpose. "Never asked" means
 * the agent stopped before the gateway saw the cart; "none published" means it
 * did ask and the audit view carried no seals — a stage-0 rejection, or a
 * transaction the read side has nothing projected for. Collapsing the two would
 * hide which side of the boundary the run actually ended on.
 */
function verdictRows(result: PurchaseResult): readonly string[] {
  if (result.verdicts.length === 0) {
    return [
      row(
        "verdicts",
        result.outcome === null
          ? "none — the gateway was never asked"
          : "none published in the gateway's audit view for this txn",
      ),
    ];
  }
  const passed = result.verdicts.filter((v) => v.outcome === "pass").length;
  return [
    row("verdicts", `${passed}/${result.verdicts.length} seals pass · chain_ok ${String(result.chainOk)}`),
    ...result.verdicts.map((verdict) =>
      row("", `${verdict.check.padEnd(14)} ${verdict.outcome}${verdict.reason_code === null ? "" : ` (${verdict.reason_code})`}`),
    ),
  ];
}

function outcomeRow(result: PurchaseResult): string {
  const outcome = result.outcome;
  if (outcome === null) {
    return row("outcome", result.status);
  }
  if (outcome.kind === "paid") {
    const link = outcome.paymentLink ?? "no link issued";
    return row(
      "outcome",
      `paid · ${outcome.txnId} · ${outcome.rzpOrderId} · ${link}`,
    );
  }
  return row("outcome", `${outcome.kind} · ${result.status}`);
}

/**
 * The causal trail, in the order §4.12 tells it: intent → memories → cart →
 * verdicts → outcome, plus what the hook refused on the way. It is assembled
 * from the run's own record and the gateway's audit view, so a judge reading
 * this in a terminal is reading the same values the Bench renders.
 */
export function trailLines(result: PurchaseResult): readonly string[] {
  return [
    row("request", result.request),
    ...intentRow(result),
    ...result.memoryWrites.map(memoryRow),
    ...cartRows(result),
    ...verdictRows(result),
    ...result.blocked.map((decision) =>
      row("blocked", `${decision.reason} — ${decision.human ?? "refused before it ran"}`),
    ),
    outcomeRow(result),
    row("status", result.status + (result.failure === null ? "" : ` · ${result.failure}`)),
  ];
}
