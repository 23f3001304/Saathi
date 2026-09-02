import type { Clock, IntentBounds, PromptJudge } from "@covenant/domain";
import type { IntentMandateIssuer, IssuedMandate } from "@covenant/mandates";

import type {
  IntentDraft,
  IntentDraftDefaults,
  IntentDraftFields,
  IntentDraftRequest,
} from "./intent-draft-fields.js";
import { draftSchemaFor, expiryAt } from "./intent-draft-fields.js";
import { listingDraftOf } from "./intent-draft-listing.js";

export const INTENT_DRAFT_PROMPT_ID = "buyer.intent-draft@v1";

/**
 * DECISION: the issuer is injected here rather than into `BuyerAgent`. Why:
 * drafting and signing are one user-facing act, "here is what I will be
 * allowed to do, sign it", and splitting them across two classes invites a
 * third caller that issues a mandate no human ever saw the draft of.
 *
 * DECISION: the schema's ceiling is the operator's cap and nothing tighter.
 * A regex over the shopper's sentence used to clamp it lower; live, the
 * model proposes the number and the sheet shows it, and a mandate the human
 * signs is the human's bound. Scripted mode reads the sentence itself, in its
 * own judge, because there the script is the model.
 */
export class IntentDrafter {
  constructor(
    private readonly judge: PromptJudge,
    private readonly issuer: IntentMandateIssuer,
    private readonly clock: Clock,
    private readonly defaults: IntentDraftDefaults,
  ) {}

  async draft(request: IntentDraftRequest): Promise<IntentDraft> {
    const schema = draftSchemaFor(
      this.defaults.currency,
      this.defaults.maxAmountPaise,
    );
    const fields = await this.judge.judge(
      INTENT_DRAFT_PROMPT_ID,
      { conversation: request.conversation, currency: this.defaults.currency },
      (value: unknown) => schema.parse(value),
      { timeoutMs: this.defaults.judgeTimeoutMs },
    );
    return {
      naturalLanguageDescription: fields.natural_language_description,
      bounds: this.boundsOf(fields),
    };
  }

  /** Sign-before-drive for a tapped open-web card; see `listingDraftOf`. */
  draftForListing(listing: {
    readonly title: string;
    readonly pricePaise: number | null;
    readonly merchant: string;
  }): IntentDraft {
    return listingDraftOf(listing, this.defaults, this.clock);
  }

  /** Called only after the human has seen `draft` and held to sign. */
  issue(
    request: IntentDraftRequest,
    draft: IntentDraft,
  ): Promise<IssuedMandate> {
    return this.issuer.issue({
      userIss: request.userIss,
      tenantId: request.tenantId,
      naturalLanguageDescription: draft.naturalLanguageDescription,
      agentInstanceId: request.agentInstanceId,
      bounds: draft.bounds,
      ttlSeconds: this.defaults.ttlSeconds,
      issuedAt: this.clock.now(),
      jti: null,
    });
  }

  private boundsOf(fields: IntentDraftFields): IntentBounds {
    const expiry = expiryAt(this.clock, this.defaults.ttlSeconds);
    return {
      allowance: {
        reason: "one_time",
        max_amount: fields.max_amount_paise,
        currency: fields.currency,
        expires_at: expiry,
        merchant_id: null,
        checkout_session_id: null,
      },
      merchants: [...fields.merchants],
      skus: [...fields.skus],
      requires_refundability: fields.requires_refundability,
      user_cart_confirmation_required:
        this.defaults.userCartConfirmationRequired,
      human_present: this.defaults.humanPresent,
      intent_expiry: expiry,
      envelopes: [...fields.envelopes],
      cooloff: this.defaults.cooloff,
      blackout_hours: null,
      credit_policy: this.defaults.creditPolicy,
      share_aggregates: this.defaults.shareAggregates,
    };
  }
}
