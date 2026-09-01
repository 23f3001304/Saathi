import type {
  AmendmentChange,
  ProposedAmendment,
  TurnPlan,
} from "@covenant/agents";
import { widensAnything } from "@covenant/agents";
import type { IdGenerator, Logger } from "@covenant/domain";

/**
 * The amendment as it reaches the conversation. Every field is either the
 * shopper's own covenant or a number the model stated and the schema accepted;
 * `direction` is neither — it was computed from `from` and `to` before this
 * object existed, and the UI recomputes it again rather than trusting the wire.
 */
export interface AmendmentBeatDraft {
  readonly kind: "amendment";
  readonly amendmentId: string;
  readonly summary: string;
  /** True when any one change gives the agent more room than it has now. */
  readonly widens: boolean;
  readonly changes: readonly AmendmentChange[];
}

export function amendmentOf(plan: TurnPlan): ProposedAmendment | null {
  if (plan.action !== "propose_amendment") {
    return null;
  }
  return plan.amendment ?? null;
}

/**
 * A proposal, prepared for the screen and for nothing else.
 *
 * DECISION: this returns a beat, never an effect. There is no path from here
 * to `POST /v1/covenant/sign`, and there is not meant to be one: the model's
 * whole authority over the covenant is the right to *say* what it heard, and
 * the 600 ms hold is what turns that into a change. A widening proposal is
 * logged at `warn` because it is the one an attacker wants — not because it is
 * refused, but because it should be visible in the log whether or not anybody
 * ends up signing it.
 */
export function amendmentBeat(
  plan: TurnPlan,
  ids: IdGenerator,
  logger: Logger,
): AmendmentBeatDraft | null {
  const amendment = amendmentOf(plan);
  if (amendment === null) {
    return null;
  }
  const widens = widensAnything(amendment);
  const draft: AmendmentBeatDraft = {
    kind: "amendment",
    amendmentId: `urn:covenant:amendment:${ids.uuid()}`,
    summary: amendment.summary,
    widens,
    changes: amendment.changes,
  };
  const fields = {
    amendment_id: draft.amendmentId,
    rules: amendment.changes.map((change) => change.rule).join(","),
    widens,
  };
  if (widens) {
    logger.warn("covenant.amendment.proposed_widening", fields);
  } else {
    logger.info("covenant.amendment.proposed", fields);
  }
  return draft;
}
