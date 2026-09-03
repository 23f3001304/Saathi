export interface TaskFeatures {
  readonly promptChars: number;
  /** 0 no tools, 1 a read, 2 a negotiation or a settlement. */
  readonly toolDepth: number;
  readonly structuredOutput: boolean;
  readonly touchesMoney: boolean;
}

export interface TaskInput {
  readonly prompt: string;
  /** Wire names of the tools this turn is actually allowed to reach. */
  readonly availableTools: readonly string[];
  readonly requiresStructuredOutput: boolean;
}

/**
 * Stems, not words, and Devanagari alongside the romanisation of the same verb.
 * A settlement asked for in Hindi is a settlement: matching only the English
 * spelling would quietly route the very turns this product exists for as chat.
 */
const SETTLEMENT_MARKERS: readonly string[] = [
  "buy",
  "purchase",
  "pay",
  "checkout",
  "place the order",
  "kharid",
  "खरीद",
  "भुगतान",
];

const NEGOTIATION_MARKERS: readonly string[] = [
  "quote",
  "negotiate",
  "haggle",
  "best price",
  "better price",
  "lower price",
  "discount",
  "cheaper",
  "counter",
  "sasta",
  "छूट",
];

const RETRIEVAL_MARKERS: readonly string[] = [
  "find",
  "search",
  "show",
  "list",
  "compare",
  "catalog",
  "browse",
  "stock",
  "dikhao",
  "दिखा",
];

function hasAny(haystack: string, needles: readonly string[]): boolean {
  return needles.some((needle) => haystack.includes(needle));
}

/**
 * Deterministic and free. Classifying the job with a model call would put a
 * model in front of the decision about which model to use, which is both a
 * cost the cascade exists to avoid and a loop the audit trail cannot explain.
 * These words size the job (does it read, haggle or settle); nothing here
 * decides what the model may say.
 */
export function extractFeatures(input: TaskInput): TaskFeatures {
  const text = input.prompt.toLowerCase();
  const hasTools = input.availableTools.length > 0;
  const settlement = hasAny(text, SETTLEMENT_MARKERS);
  const deep = settlement || hasAny(text, NEGOTIATION_MARKERS);
  const shallow = hasAny(text, RETRIEVAL_MARKERS);
  return {
    promptChars: input.prompt.length,
    toolDepth: depthOf(hasTools, deep, shallow),
    structuredOutput: input.requiresStructuredOutput,
    touchesMoney: settlement,
  };
}

function depthOf(hasTools: boolean, deep: boolean, shallow: boolean): number {
  if (!hasTools) {
    return 0;
  }
  if (deep) {
    return 2;
  }
  return shallow ? 1 : 0;
}
