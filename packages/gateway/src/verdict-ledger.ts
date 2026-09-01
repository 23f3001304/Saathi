import type {
  EventSink,
  ReasonCode,
  TimedVerdict,
  ToPass,
} from "@covenant/domain";
import { sealOf } from "@covenant/domain";

import { attackDraftFor } from "./attack-ledger.js";
import type { AttackContext } from "./attack-ledger.js";

export interface RejectionRecord extends AttackContext {
  readonly verdicts: readonly TimedVerdict[];
  readonly decision: "reject" | "hold" | "approve";
  readonly reasonCode: ReasonCode | null;
  readonly toPass: ToPass | null;
}

/**
 * The rejection half of the ledger contract: one `verdict.emitted` always, and
 * an `attack.detected` only where the block is not already legible from the
 * failing seal (decision 24). Shared by stage 0 and by the pipeline so a
 * malformed credential and a failed check leave the same shaped trail.
 */
export class VerdictLedger {
  constructor(private readonly events: EventSink) {}

  emit(record: RejectionRecord): void {
    this.events.append({
      tenant_id: record.tenantId,
      actor: "gateway",
      kind: "verdict.emitted",
      txn_id: record.txnId,
      request_id: record.requestId,
      mandate_id: record.mandateId,
      payload: {
        decision: record.decision,
        reason_code: record.reasonCode,
        verdicts: record.verdicts.map(sealOf),
        to_pass: record.toPass === null ? null : { ...record.toPass },
      },
    });
    const attack = attackDraftFor(record.reasonCode, record);
    if (attack !== null) {
      this.events.append(attack);
    }
  }
}
