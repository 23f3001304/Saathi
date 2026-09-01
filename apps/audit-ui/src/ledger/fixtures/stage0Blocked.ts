// §8 beat 2:45–3:00 (T-27) — a URI downgrade caught before the check
// pipeline runs at all: zero seals, not eight failing ones (gateway
// contract note: verdicts are "0 or 8," never a partial row).
import type { LedgerFrame, VerdictPayload } from "../types.ts";
import { buildFrames, type FrameInput } from "./helpers.ts";

export const STAGE0_TXN_ID = "txn-uripin3fa1";
export const STAGE0_BASE_MS = Date.parse("2026-08-31T08:47:00.000Z");

const inputs: FrameInput[] = [
  {
    offsetMs: 0,
    actor: "gateway",
    kind: "verdict.emitted",
    txn_id: STAGE0_TXN_ID,
    payload: {
      txn_id: STAGE0_TXN_ID,
      checks: [],
      latency_ms: 9,
      stage0_rejection: {
        reason_code: "URI_DOWNGRADE",
        human_sentence:
          "The checkout page it was pointed at was not the merchant's own. Refused before anything else was checked.",
        to_pass: { required: "the pinned checkout URI" },
      },
    } satisfies VerdictPayload,
  },
  {
    offsetMs: 40,
    actor: "gateway",
    kind: "attack.detected",
    txn_id: STAGE0_TXN_ID,
    payload: {
      attack_id: "T-27",
      reason_code: "URI_DOWNGRADE",
      human: "Something tried to send this payment somewhere else. Refused.",
      detail_kind: "verdict.emitted",
    },
  },
];

export function stage0BlockedFrames(): LedgerFrame[] {
  return buildFrames(STAGE0_BASE_MS, inputs);
}
