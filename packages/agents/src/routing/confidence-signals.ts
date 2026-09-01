/** Did the structured output hold, and did it hold on the first attempt? */
export type SchemaOutcome =
  "first_try" | "after_repair" | "failed" | "not_required";

/** Were the arguments the model handed the tools well-formed and in-bounds? */
export type ToolArgsOutcome = "all" | "some" | "none" | "not_required";

export interface ConfidenceSignals {
  readonly schema: SchemaOutcome;
  readonly toolArgs: ToolArgsOutcome;
  readonly hedges: number;
  readonly refused: boolean;
  /** The model's own 0–1 rating, when it was asked for one and gave one. */
  readonly selfRated: number | null;
  /** Agreement between two cheap samples; `null` unless the class paid for it. */
  readonly agreement: number | null;
}

/**
 * No vendor gives a comparable cross-provider logprob, so the text signal is
 * lexical. These are markers of an answer that is not committing, not markers
 * of politeness: "let me check" is fine, "I think, but I'm not sure" is not.
 */
export const HEDGE_MARKERS: readonly string[] = [
  "i'm not sure",
  "i am not sure",
  "not certain",
  "might be",
  "may be wrong",
  "i think",
  "possibly",
  "it seems",
  "hard to say",
  "unclear",
  "i don't know",
  "i do not know",
  "cannot be certain",
];

export const REFUSAL_MARKERS: readonly string[] = [
  "i can't help",
  "i cannot help",
  "i'm unable to",
  "i am unable to",
  "as an ai",
  "i won't be able",
];

export function countHedges(text: string): number {
  const lowered = text.toLowerCase();
  return HEDGE_MARKERS.filter((marker) => lowered.includes(marker)).length;
}

export function looksRefusal(text: string): boolean {
  const lowered = text.toLowerCase();
  return REFUSAL_MARKERS.some((marker) => lowered.includes(marker));
}

/**
 * Appended to the system prompt on any class that asks for structured output.
 * A self-rating is a weak signal on its own — models are optimistic — which is
 * why it carries one of the smaller weights rather than deciding anything.
 */
export const SELF_RATING_INSTRUCTION =
  'Include a "confidence" field in your JSON output: your own estimate, ' +
  "between 0 and 1, that the answer is correct and complete. Rate honestly; " +
  "a low rating costs you nothing.";

const SELF_RATING_PATTERN = /"confidence"\s*:\s*(0(?:\.\d+)?|1(?:\.0+)?)/;

export function readSelfRating(text: string): number | null {
  const matched = SELF_RATING_PATTERN.exec(text);
  if (matched === null || matched[1] === undefined) {
    return null;
  }
  return Number(matched[1]);
}

export interface SignalInput {
  readonly text: string;
  readonly schema: SchemaOutcome;
  readonly toolArgs: ToolArgsOutcome;
  readonly agreement: number | null;
  /** The turn answers by calling a tool, so prose beside it is optional. */
  readonly decidesByTool?: boolean;
}

/**
 * An empty answer is read as a refusal: a non-answer is not a confident one.
 *
 * Except where the answer was never the prose. A planner that puts every word
 * it says inside the tool arguments returns empty text and had scored zero for
 * certainty — which held the correct choice a hair above τ, and let a sample
 * that disagreed by one word climb to a rung tuned for a script the shopper had
 * not written in. Silence beside a tool call is not a refusal.
 */
export function signalsOf(input: SignalInput): ConfidenceSignals {
  const silent = input.text.trim().length === 0 && !input.decidesByTool;
  return {
    schema: input.schema,
    toolArgs: input.toolArgs,
    hedges: countHedges(input.text),
    refused: silent || looksRefusal(input.text),
    selfRated: readSelfRating(input.text),
    agreement: input.agreement,
  };
}
