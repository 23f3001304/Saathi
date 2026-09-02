import type {
  CatalogSku,
  DraftFields,
  IntentDraftFields,
  ShelfView,
} from "@covenant/agents";
import { findSku, INTENT_DRAFT_PROMPT_ID } from "@covenant/agents";
import type { PromptInput, PromptJudge, ResponseSchema } from "@covenant/domain";

import type { PendingDraft } from "../purchase/pending-draft.js";
import type { DraftPlanConfig } from "./draft-plan.js";
import { envelopesFor } from "./draft-plan.js";

/**
 * The live drafter: the draft is what the planner proposed, completed by the
 * facts only the host holds and checked by the schema the drafter applies.
 *
 * DECISION: no second model and no fallback. A separate drafting session used
 * to turn prose into JSON, resolve a product name by label, and fall back to a
 * regex drafter when either failed; every one of those was a place the sheet
 * could show a number nobody had said. Now the model states `sku`,
 * `max_amount_paise`, `requires_refundability` and `description` in one tool
 * call, the collector has already refused a sku off the shelf and a ceiling
 * above the cap, and `draftSchemaFor` holds the operator's cap once more as
 * a literal. The split is the same as ever: the model decides what to buy
 * and how much to spend; the host decides who sells it and what it is called.
 */
export class PlanDraftJudge implements PromptJudge {
  constructor(
    private readonly pending: PendingDraft,
    private readonly config: DraftPlanConfig,
    private readonly shelf: ShelfView,
  ) {}

  async judge<T>(
    promptId: string,
    input: PromptInput,
    schema: ResponseSchema<T>,
  ): Promise<T> {
    if (promptId !== INTENT_DRAFT_PROMPT_ID) {
      throw new Error(`agent-host has no sealed prompt "${promptId}"`);
    }
    const draft = this.pending.current();
    if (draft === null) {
      throw new Error("no draft held for this turn");
    }
    const row = findSku(this.shelf.current(), draft.sku);
    if (row === null) {
      throw new Error(
        `the draft names "${draft.sku}", which this shelf does not hold`,
      );
    }
    return schema(this.fieldsOf(draft, row));
  }

  private fieldsOf(draft: DraftFields, row: CatalogSku): IntentDraftFields {
    return {
      natural_language_description: draft.description.slice(0, 400),
      max_amount_paise: draft.maxAmountPaise,
      currency: this.config.currency,
      merchants: [this.config.merchantIss],
      skus: [row.sku],
      requires_refundability: draft.requiresRefundability,
      envelopes: envelopesFor(row, draft.maxAmountPaise),
    };
  }
}
