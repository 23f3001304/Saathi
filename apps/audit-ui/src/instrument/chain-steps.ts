// Plain-language summaries and step states for the run timeline. The
// summaries carry the substance while a step rests folded, so a glance at
// the closed timeline still tells the whole story.
import type { TxnView } from "../ledger/reducer.ts";
import type { CooloffPayload } from "../ledger/types.ts";
import { paise } from "../primitives/formatMoney.ts";
import type { StepState } from "./ChainSection.tsx";

export type StepFacts = { summary: string; state: StepState };

export function intentFacts(txn: TxnView | undefined): StepFacts {
  const intent = txn?.intent;
  if (intent === undefined) {
    return { summary: "Waiting for you to sign", state: "pending" };
  }
  return {
    summary: intent.natural_language_description,
    state: "done",
  };
}

export function memoryFacts(txn: TxnView | undefined): StepFacts {
  const memories = txn?.memories ?? [];
  if (memories.length === 0) {
    return { summary: "Nothing consulted yet", state: "pending" };
  }
  const tiers = memories.map((m) => m.tier).join(" ");
  return { summary: `${memories.length} memories · ${tiers}`, state: "done" };
}

export function cartFacts(txn: TxnView | undefined): StepFacts {
  const cart = txn?.cart;
  if (cart === undefined) {
    return { summary: "Not built yet", state: "pending" };
  }
  return {
    summary: `${paise(cart.total_paise)} · digest ${cart.memory_digest.slice(0, 8)}…`,
    state: "done",
  };
}

function blocked(summary: string | undefined): StepFacts {
  return { summary: summary ?? "Blocked", state: "blocked" };
}

function blockedFacts(txn: TxnView | undefined): StepFacts | null {
  const stage0 = txn?.stage0Rejection;
  if (stage0 !== undefined) {
    return blocked(stage0.human_sentence ?? stage0.reason_code);
  }
  const failed = (txn?.checks ?? []).find((c) => !c.passed);
  if (failed !== undefined) {
    return blocked(failed.human_sentence ?? failed.reason_code);
  }
  return null;
}

export function verdictFacts(
  txn: TxnView | undefined,
  cooloff?: CooloffPayload,
): StepFacts {
  const blocked = blockedFacts(txn);
  if (blocked !== null) return blocked;
  const checks = txn?.checks ?? [];
  if (checks.length === 0) {
    return { summary: "Not checked yet", state: "pending" };
  }
  const passed = checks.filter((c) => c.passed).length;
  if (cooloff !== undefined) {
    return {
      summary: `${passed} passed · holding for your cool-off`,
      state: "active",
    };
  }
  return { summary: `All ${passed} passed`, state: "done" };
}

export function railFacts(txn: TxnView | undefined): StepFacts {
  const calls = txn?.rzpCalls ?? [];
  if (calls.length === 0) {
    return { summary: "No money has moved", state: "pending" };
  }
  return {
    summary: `${calls.length} calls, all idempotent, agent flagged`,
    state: "done",
  };
}

/** The payment states, said rather than spelled. */
const OUTCOME_SUMMARY: Record<string, string> = {
  pending: "Waiting on Razorpay",
  failed: "The payment did not go through",
  parked: "Set aside after a failure",
};

export function outcomeFacts(txn: TxnView | undefined): StepFacts {
  const outcome = txn?.outcome;
  if (outcome === undefined) {
    return { summary: "Nothing charged yet", state: "pending" };
  }
  if (outcome.status === "captured") {
    return {
      summary: `Razorpay took ${paise(outcome.amount_paise)}`,
      state: "done",
    };
  }
  return {
    summary: OUTCOME_SUMMARY[outcome.status] ?? outcome.status,
    state: "active",
  };
}
