import type { ProposedAmendment } from "./covenant-amendment.js";
import type { TraitClaim } from "./trait-claim.js";

export {
  AMENDABLE_RULES,
  amendableVocabulary,
  directionOf,
  widensAnything,
} from "./covenant-amendment.js";
export type {
  AmendableRule,
  AmendmentChange,
  AmendmentDirection,
  AmendmentKind,
  AmendmentValue,
  ProposedAmendment,
} from "./covenant-amendment.js";
export {
  DEFAULT_AMENDMENT_CONTEXT,
  parseAmendment,
} from "./amendment-schema.js";
export type { AmendmentContext, AmendmentParse } from "./amendment-schema.js";
export { parseTrait } from "./trait-claim.js";
export type { TraitClaim } from "./trait-claim.js";

/** The buyer's own tools. They reach no merchant and no gateway: calling one
 *  records what the agent decided this turn was, and nothing else happens. */
export const BUYER_TOOL_SERVER = "covenant_buyer";

export const ANSWER_TOOL = "answer_shopper";
export const BROWSE_TOOL = "browse_catalog";
/** The schema advertises this bound and the collector enforces it; one
 *  constant so the two cannot drift apart. */
export const MAX_BROWSE_SKUS = 4;
export const WEB_LOOK_TOOL = "look_on_web";
export const PROPOSE_TOOL = "propose_purchase";
export const AMEND_TOOL = "amend_covenant";
export const DECLINE_TOOL = "decline_purchase";
export const REMEMBER_TOOL = "remember_trait";

/** They chose one of the cards on their screen, in words. The host takes
 *  the same path a tap on that card takes; the model only names the ref. */
export const PICK_TOOL = "pick_option";

/** The reads. Neither is a move: the model looks, then still calls exactly
 *  one of the moves above. Declared beside them so every provider hands the
 *  hook the same `(tool, server)` pair for a look as for a move. */
export const SEE_SHELF_TOOL = "see_shelf";
export const SEE_STATE_TOOL = "see_state";

export const TURN_ACTIONS = [
  "answer",
  "browse",
  "look_on_web",
  "draft_intent",
  "decline",
  "propose_amendment",
  "pick",
] as const;

export type TurnAction = (typeof TURN_ACTIONS)[number];

export interface ChoiceGroup {
  readonly label: string;
  readonly options: readonly string[];
}

/**
 * What `propose_purchase` carried: the model's own draft, in the shape the
 * signing sheet shows. The host completes it with the facts only it holds
 * (who sells it, which currency, the envelope policy) and never rewrites a
 * number in it: a number the human did not see is a number nobody signed.
 */
export interface DraftFields {
  readonly sku: string;
  readonly maxAmountPaise: number;
  readonly requiresRefundability: boolean;
  readonly description: string;
}

export interface TurnPlan {
  readonly action: TurnAction;
  /** The WHOLE of what the agent says this turn. Prose, never a payload. */
  readonly reply: string;
  /** The question the model needs answered, and only when `reply` does not
   *  already ask it. One utterance per turn is an invariant of this type. */
  readonly question: string | null;
  /**
   * The answers worth offering as chips at the composer — capacities, sizes,
   * an internal-or-external. A question with three named choices is a question
   * a shopper can answer with a thumb; one without them is a typing exercise.
   * Empty is normal and means the answer has to be typed.
   */
  readonly replies?: readonly string[];
  /** A compound question's axes: one labelled group per axis, one pick per
   *  group. Optional; flat `replies` stays the simple form. */
  readonly choiceGroups?: readonly ChoiceGroup[];
  /** What to look for, when the move is `browse` or `look_on_web`. */
  readonly query?: string | null;
  /** `look_on_web`: the shop they named, in their own characters. The model
   *  decides that a shop was named; the host resolves the name to hosts and
   *  holds the errand to them. `null` where they named none. */
  readonly shop?: string | null;
  /** `browse`: the skus the model chose to show, read off `see_shelf`. The
   *  cards are built from the shelf rows for exactly these, in this order. */
  readonly skus?: readonly string[];
  /** `draft_intent`: the draft the sheet will show. Absent on a scripted
   *  plan, whose judge reads the conversation instead. */
  readonly draft?: DraftFields | null;
  /** `pick`: the on-screen ref the model chose. */
  readonly ref?: string | null;
  /** The change to the covenant the model proposed. A proposal and nothing
   *  more: only a signature applies one. */
  readonly amendment?: ProposedAmendment | null;
  /** Durable facts about the shopper heard this turn, at P1 like anything
   *  else they typed. Being durable does not make one more trusted. */
  readonly traits?: readonly TraitClaim[];
}

/** The move the harness takes when the model called no tool at all. Answering
 *  is the only safe default: a purchase must be asked for, never assumed. */
export const NEUTRAL_PLAN: TurnPlan = {
  action: "answer",
  reply: "",
  question: null,
  replies: [],
  query: null,
  shop: null,
  amendment: null,
  traits: [],
};
