/**
 * The dark patterns an online shop runs on a person, named.
 *
 * These are not our coinages: the vocabulary is Brignull's dark-pattern
 * taxonomy as it has been taken up by the FTC's "Bringing Dark Patterns to
 * Light" (2022) and the CMA's Online Choice Architecture work — scarcity,
 * urgency, false anchoring, drip pricing, confirmshaming, preselection, social
 * proof pressure, obstruction. They are documented because they work: each one
 * is calibrated against a bias in human decision-making.
 *
 * An agent shopping with a signed budget is a new kind of target for them, and
 * the interesting thing is that it does not have to be vulnerable. A person
 * cannot switch off loss aversion. An agent's bounds come from a mandate its
 * buyer signed, so a countdown timer has nothing to push against — but only if
 * the resistance is structural. Ours currently lives in a paragraph of
 * `buyer-prompt.ts`, which means it holds exactly as long as the model chooses
 * to cooperate, and a prompt injection is an argument aimed at precisely that.
 * So detection is deterministic, here, in code, below the model.
 *
 * What this module does NOT do: decide anything. It names what it found and
 * counts it. The verdict engine bounds the money, the write gate tiers the
 * claim, and the merchant trust fold keeps the tally — a shop that runs these
 * on an agent is describing itself, and the ledger is listening.
 */

export const MANIPULATION_KINDS = [
  "scarcity",
  "urgency",
  "false_anchor",
  "drip_pricing",
  "confirmshaming",
  "preselection",
  "social_proof",
  "obstruction",
] as const;

export type ManipulationKind = (typeof MANIPULATION_KINDS)[number];

export interface PatternSpec {
  readonly kind: ManipulationKind;
  /** What it exploits, in one line. This is the reason it is worth naming. */
  readonly bias: string;
  /** How the agent answers it. Never "ignore": always a concrete counter. */
  readonly counter: string;
  readonly cues: readonly RegExp[];
}

/**
 * Cues are matched on merchant-authored text only, and matching one is not an
 * accusation — "last few left" may be true. It is recorded as a cue, weighed
 * against what the ledger has attested, and left for the trust fold to judge
 * across many quotes rather than one sentence.
 */
export const PATTERNS: readonly PatternSpec[] = [
  {
    kind: "scarcity",
    bias: "Loss aversion: a thing about to be unavailable feels more valuable.",
    counter:
      "Stock claims are untrusted text. Availability is only real when the " +
      "merchant signs a quote that reserves it.",
    cues: [
      /\bonly\s+\d+\s+(left|remaining|in stock)\b/i,
      /\b(last|final)\s+(few|one|piece|item)s?\b/i,
      /\b(almost|nearly)\s+(sold\s*out|gone)\b/i,
      /\bselling\s+(fast|out)\b/i,
      /\bhurry\b/i,
    ],
  },
  {
    kind: "urgency",
    bias: "Time pressure narrows deliberation and favours the default.",
    counter:
      "A deadline the merchant asserts does not move the intent's expiry, " +
      "and cool-off is measured from the covenant, never from the page.",
    cues: [
      /\btoday\s+only\b/i,
      /\bends?\s+(in|at|today|tonight|soon)\b/i,
      /\b\d+\s*(hours?|hrs?|minutes?|mins?)\s+left\b/i,
      /\b(flash|lightning)\s+(sale|deal)\b/i,
      /\bdeal\s+of\s+the\s+(day|hour)\b/i,
      /\blimited\s+time\b/i,
    ],
  },
  {
    kind: "false_anchor",
    bias: "Anchoring: the first number seen sets what every other number means.",
    counter:
      "A discount is measured against attested price history, not against a " +
      "number the shop struck through.",
    cues: [
      /\bwas\s*(₹|rs\.?|inr)\s*[\d,]+/i,
      /\bm\.?r\.?p\.?\b/i,
      /\b\d+\s*%\s*off\b/i,
      /\bsave\s*(₹|rs\.?|inr)\s*[\d,]+/i,
      /\bworth\s*(₹|rs\.?|inr)\s*[\d,]+/i,
    ],
  },
  {
    kind: "drip_pricing",
    bias: "Sunk cost: fees revealed late are paid rather than restarted around.",
    counter:
      "The signed quote carries per-line hashes, so a total that grows " +
      "between quote and cart fails the cart check instead of being paid.",
    cues: [
      /\b(convenience|handling|platform|service)\s+fee\b/i,
      /\bextra\s+charges?\s+(may\s+)?appl(y|ies)\b/i,
      /\btaxes?\s+(extra|additional)\b/i,
      /\bat\s+checkout\b/i,
    ],
  },
  {
    kind: "confirmshaming",
    bias: "Shame: declining is written so that refusing feels like a failing.",
    counter:
      "Refusal costs the agent nothing. There is no copy it can be " +
      "embarrassed by.",
    cues: [
      /\bno,?\s+i\s+(don'?t|do not)\s+want\b/i,
      /\bi\s+(like|prefer)\s+paying\s+full\b/i,
      /\bno\s+thanks,?\s+i\b/i,
      /\bmiss\s+out\b/i,
    ],
  },
  {
    kind: "preselection",
    bias: "Default bias: a pre-ticked box is accepted far more often than chosen.",
    counter:
      "Every line of the cart is enumerated in the mandate. A line nobody " +
      "asked for is a line the buyer can see before signing.",
    cues: [
      /\b(pre[- ]?selected|pre[- ]?checked|auto[- ]?add(ed)?)\b/i,
      /\badded\s+for\s+you\b/i,
      /\brecommended\s+add[- ]?on\b/i,
    ],
  },
  {
    kind: "social_proof",
    bias: "Herding: other people's choices substitute for one's own judgement.",
    counter:
      "Crowd claims are unverifiable and carry no tier. They cannot enter " +
      "the ranking.",
    cues: [
      /\b\d+\s+(people|others|customers)\s+(are\s+)?(viewing|bought|watching)\b/i,
      /\bbest[- ]?sell(er|ing)\b/i,
      /\btrending\s+now\b/i,
      /\bin\s+\d+\s+carts\b/i,
    ],
  },
  {
    kind: "obstruction",
    bias: "Friction: what is hard to find is treated as though it did not exist.",
    counter:
      "Refundability is a term of the covenant. If it is not stated and " +
      "signed, the purchase does not satisfy the intent.",
    cues: [
      /\bnon[- ]?refundable\b/i,
      /\bno\s+(returns?|refunds?|cancellations?)\b/i,
      /\ball\s+sales\s+final\b/i,
      /\bsee\s+terms\s+for\s+details\b/i,
    ],
  },
];
