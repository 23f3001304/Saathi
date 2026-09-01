import type {
  GatewayClient,
  IntentDraft,
  IntentDrafter,
} from "@covenant/agents";
import type { IntentBounds, Logger } from "@covenant/domain";
import type { IssuedMandate } from "@covenant/mandates";
import { readProtectedHeader } from "@covenant/mandates";

import type { BeatHub } from "../http/beat-hub.js";
import type { ConfirmationGate } from "./confirmation-gate.js";

export interface SignedIntent {
  readonly mandate: IssuedMandate;
  readonly bounds: IntentBounds;
  readonly description: string;
  readonly mandateId: string;
  readonly constraintIds: readonly string[];
}

/**
 * Anything that must be told what the signed covenant permits — today the
 * sandbox window, whose cart check has no other ceiling it is allowed to use.
 * Structural on purpose: this file must not learn that a browser exists.
 */
export interface CeilingSink {
  bindCeiling(
    bounds: { readonly capPaise: number; readonly currency: string } | null,
  ): void;
}

export interface IntentFlowConfig {
  readonly userIss: string;
  readonly tenantId: string;
  readonly agentInstanceId: string;
}

export class IntentRejected extends Error {
  constructor(
    readonly reasonCode: string,
    human: string,
  ) {
    super(human);
    this.name = "IntentRejected";
  }
}

/** ES256 plus the kid the pinned ring resolves — what the signing sheet shows. */
function thumbprintOf(mandate: IssuedMandate): string {
  return `ES256 · ${readProtectedHeader(mandate.jwt).kid}`;
}

/**
 * Draft → show → hold-to-sign → `POST /v1/covenant/sign`, in that order and
 * with no shortcut through it. The mandate is signed with the **user** key, and
 * the gateway turns every bound in it into a P3 constraint — which is the only
 * way a constraint can be created (§9.2), and therefore the reason a poisoned
 * catalog line has no path to one.
 */
export class IntentFlow {
  constructor(
    private readonly drafter: IntentDrafter,
    private readonly gateway: GatewayClient,
    private readonly hub: BeatHub,
    private readonly gate: ConfirmationGate,
    private readonly ceiling: CeilingSink,
    private readonly logger: Logger,
    private readonly config: IntentFlowConfig,
  ) {}

  async sign(conversation: readonly string[]): Promise<SignedIntent> {
    // Nothing is bounded until something is signed, and a ceiling left over
    // from the last run would bound this one by accident.
    this.ceiling.bindCeiling(null);
    const draftRequest = {
      conversation,
      userIss: this.config.userIss,
      tenantId: this.config.tenantId,
      agentInstanceId: this.config.agentInstanceId,
    };
    const draft = await this.drafter.draft(draftRequest);
    this.hub.emit({
      kind: "intent-draft",
      description: draft.naturalLanguageDescription,
    });
    this.hub.emit({ kind: "signing-required" });
    await this.gate.wait();
    const mandate = await this.drafter.issue(draftRequest, draft);
    return this.commit(mandate, draft);
  }

  private async commit(
    mandate: IssuedMandate,
    draft: IntentDraft,
  ): Promise<SignedIntent> {
    const signed = await this.gateway.signCovenant({
      intent_mandate_jwt: mandate.jwt,
    });
    if (!signed.ok) {
      this.logger.error("intent.sign.failed", {
        reason_code: signed.failure.reasonCode,
      });
      throw new IntentRejected(signed.failure.reasonCode, signed.failure.human);
    }
    this.ceiling.bindCeiling({
      capPaise: draft.bounds.allowance.max_amount,
      currency: draft.bounds.allowance.currency,
    });
    this.hub.emit({
      kind: "intent-signed",
      capPaise: draft.bounds.allowance.max_amount,
      thumbprint: thumbprintOf(mandate),
    });
    this.logger.info("intent.signed", {
      mandate_id: signed.value.mandate_id,
      constraints: signed.value.committed_constraints.length,
      cap_paise: draft.bounds.allowance.max_amount,
    });
    return {
      mandate,
      bounds: draft.bounds,
      description: draft.naturalLanguageDescription,
      mandateId: signed.value.mandate_id,
      constraintIds: signed.value.committed_constraints,
    };
  }
}
