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
export const WEB_LOOK_TOOL = "look_on_web";
export const PROPOSE_TOOL = "propose_purchase";
export const AMEND_TOOL = "amend_covenant";
export const DECLINE_TOOL = "decline_purchase";
export const REMEMBER_TOOL = "remember_trait";

export const TURN_ACTIONS = [
  "answer",
  "browse",
  "look_on_web",
  "draft_intent",
  "decline",
  "propose_amendment",
] as const;

export type TurnAction = (typeof TURN_ACTIONS)[number];

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
  /** What to look for, when the move is `browse` or `look_on_web`. */
  readonly query?: string | null;
  /** The change to the covenant the model proposed. A proposal and nothing
   *  more: only a signature applies one. */
  readonly amendment?: ProposedAmendment | null;
  /** Durable facts about the shopper heard this turn, at P1 like anything
   *  else they typed. Being durable does not make one more trusted. */
  readonly traits?: readonly TraitClaim[];
}

/**
 * How many things in this shop match a query.
 *
 * DECISION: a count, never a sentence. The listing must stay harness-authored
 * — an agent that writes its own stock list can describe things the shop does
 * not have — but that is a rule about *facts*, not about the prose around
 * them. Handing the model the number and letting it say what the number means
 * is what stops "This shop has nothing like that" being welded, in English,
 * onto the end of a sentence the agent just wrote in Hindi.
 */
export interface CatalogProbe {
  matches(query: string): number;
}

/** The move the harness takes when the model called no tool at all. Answering
 *  is the only safe default: a purchase must be asked for, never assumed. */
export const NEUTRAL_PLAN: TurnPlan = {
  action: "answer",
  reply: "",
  question: null,
  replies: [],
  query: null,
  amendment: null,
  traits: [],
};
