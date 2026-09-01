import type {
  AttackDetectedPayload,
  EventDraft,
  ReasonCode,
} from "@covenant/domain";
import { REASON_HUMAN } from "@covenant/domain";

interface AttackShape {
  readonly attack_id: string | null;
  readonly detail_kind: string;
}

/**
 * `attack.detected` covers only blocks that are **not** already legible as a
 * failing `verdict.emitted` (decision 24). Three codes are ledgered twice on
 * purpose: a burned mandate re-presented under a different key is both a policy
 * rejection and a replay attempt; a downgraded extension URI is the T-27
 * signature; a cross-tenant nonce hit is an attempt to probe another namespace.
 */
const ATTACKS: Partial<Record<ReasonCode, AttackShape>> = {
  NONCE_BURNED: { attack_id: "T-31", detail_kind: "nonce.replay" },
  URI_DOWNGRADE: { attack_id: "T-27", detail_kind: "uri.downgrade" },
  TENANT_MISMATCH: { attack_id: null, detail_kind: "tenant.mismatch" },
};

export interface AttackContext {
  readonly tenantId: string;
  readonly txnId: string | null;
  readonly requestId: string;
  readonly mandateId: string | null;
}

export function attackDraftFor(
  reasonCode: ReasonCode | null,
  context: AttackContext,
): EventDraft | null {
  const shape = reasonCode === null ? undefined : ATTACKS[reasonCode];
  if (shape === undefined || reasonCode === null) {
    return null;
  }
  const payload: AttackDetectedPayload = {
    attack_id: shape.attack_id,
    reason_code: reasonCode,
    human: REASON_HUMAN[reasonCode],
    detail_kind: shape.detail_kind,
  };
  return {
    tenant_id: context.tenantId,
    actor: "attacker",
    kind: "attack.detected",
    txn_id: context.txnId,
    request_id: context.requestId,
    mandate_id: context.mandateId,
    payload: { ...payload },
  };
}
