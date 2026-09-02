import type {
  Clock,
  CooloffRule,
  CreditPolicy,
  IntentBounds,
  PromptJudge,
} from "@covenant/domain";
import type { IntentMandateIssuer, IssuedMandate } from "@covenant/mandates";
import { z } from "zod";
import { ceilingFor } from "./stated-budget.js";

export const INTENT_DRAFT_PROMPT_ID = "buyer.intent-draft@v1";

const envelopeSchema = z.strictObject({
  category: z.string().min(1),
  period: z.enum(["day", "week", "month"]),
  cap_paise: z.number().int().positive(),
});

/**
 * What the sealed prompt may return — labelled data, never instructions.
 *
 * DECISION: the currency and the ceiling are **schema literals**, built from
 * the covenant's own configuration rather than left to the model. A draft
 * denominated in a currency this covenant does not hold, or capped at zero, or
 * naming nothing to buy, is not a tighter intent or a looser one: it is not an
 * intent. It is rejected here, before signing, on every model the router might
 * have picked and however confidently that model answered.
 *
 * `merchants` and `skus` are required and non-empty for the same reason. An
 * allowance that names no merchant and no SKU is unbounded in the two
 * dimensions that matter most, and a greeting cannot produce either — which is
 * what stops "hi" from becoming something a human is asked to sign.
 */
export function draftSchemaFor(
  currency: string,
  maxAmountPaise: number,
): z.ZodType<IntentDraftFields> {
  return z.strictObject({
    natural_language_description: z.string().min(1).max(400),
    max_amount_paise: z.number().int().positive().max(maxAmountPaise),
    currency: z.literal(currency),
    merchants: z.array(z.string().min(1)).min(1),
    skus: z.array(z.string().min(1)).min(1),
    requires_refundability: z.boolean(),
    envelopes: z.array(envelopeSchema),
  });
}

export interface IntentDraftFields {
  readonly natural_language_description: string;
  readonly max_amount_paise: number;
  readonly currency: string;
  readonly merchants: readonly string[];
  readonly skus: readonly string[];
  readonly requires_refundability: boolean;
  readonly envelopes: readonly z.infer<typeof envelopeSchema>[];
}

export interface IntentDraftDefaults {
  /** The denomination of the allowance. A literal in the schema, not a hint. */
  readonly currency: string;
  /** The ceiling the drafted allowance may not exceed, in minor units. */
  readonly maxAmountPaise: number;
  readonly ttlSeconds: number;
  readonly cooloff: CooloffRule | null;
  readonly creditPolicy: CreditPolicy;
  readonly humanPresent: boolean;
  readonly userCartConfirmationRequired: boolean;
  readonly shareAggregates: boolean;
  readonly judgeTimeoutMs: number;
}

export interface IntentDraftRequest {
  readonly conversation: readonly string[];
  readonly userIss: string;
  readonly tenantId: string;
  readonly agentInstanceId: string;
}

export interface IntentDraft {
  readonly naturalLanguageDescription: string;
  readonly bounds: IntentBounds;
}

/**
 * DECISION: the issuer is injected here rather than into `BuyerAgent`. Why:
 * drafting and signing are one user-facing act — "here is what I will be
 * allowed to do, sign it" — and splitting them across two classes invites a
 * third caller that issues a mandate no human ever saw the draft of.
 */
export class IntentDrafter {
  constructor(
    private readonly judge: PromptJudge,
    private readonly issuer: IntentMandateIssuer,
    private readonly clock: Clock,
    private readonly defaults: IntentDraftDefaults,
  ) {}

  async draft(request: IntentDraftRequest): Promise<IntentDraft> {
    // The schema's ceiling is the tighter of the operator's cap and the number
    // the shopper said. A request for "under 4000" was drafted at the host cap
    // and signed as "at most 5000.00 INR" — a mandate looser than the sentence
    // that produced it, which is the one thing this drafter must never emit.
    const schema = draftSchemaFor(
      this.defaults.currency,
      ceilingFor(request.conversation.join(" "), this.defaults.maxAmountPaise),
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

  /**
   * A draft for one open-web listing, built from the card the shopper
   * tapped rather than judged against the catalog: the catalog judge
   * refused every web product as "no product this catalog sells", which is
   * true and beside the point. The ceiling is the carded price itself -
   * what they saw is exactly what they authorise - and the description
   * names the listing and the shop.
   */
  draftForListing(listing: {
    readonly title: string;
    readonly pricePaise: number | null;
    readonly merchant: string;
  }): IntentDraft {
    const cap = listing.pricePaise ?? this.defaults.maxAmountPaise;
    const rupees = Math.round(cap / 100).toLocaleString("en-IN");
    const expiry = this.expiry();
    return {
      naturalLanguageDescription:
        `${listing.title.slice(0, 200)}: at most ₹${rupees}, ` +
        `on ${listing.merchant}.`,
      bounds: {
        allowance: {
          reason: "one_time",
          max_amount: cap,
          currency: this.defaults.currency,
          expires_at: expiry,
          merchant_id: null,
          checkout_session_id: null,
        },
        merchants: null,
        skus: null,
        requires_refundability: false,
        user_cart_confirmation_required:
          this.defaults.userCartConfirmationRequired,
        human_present: this.defaults.humanPresent,
        intent_expiry: expiry,
        envelopes: [],
        cooloff: this.defaults.cooloff,
        blackout_hours: null,
        credit_policy: this.defaults.creditPolicy,
        share_aggregates: this.defaults.shareAggregates,
      },
    };
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
    const expiry = this.expiry();
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

  private expiry(): string {
    const ms = this.clock.now().getTime() + this.defaults.ttlSeconds * 1000;
    return new Date(ms).toISOString();
  }
}
