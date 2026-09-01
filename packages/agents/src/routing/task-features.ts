export type ScriptClass = "latin" | "indic" | "mixed";

export interface TaskFeatures {
  readonly promptChars: number;
  /** 0 no tools, 1 a read, 2 a negotiation or a settlement. */
  readonly toolDepth: number;
  readonly structuredOutput: boolean;
  readonly touchesMoney: boolean;
  readonly script: ScriptClass;
}

export interface TaskInput {
  readonly prompt: string;
  /** Wire names of the tools this turn is actually allowed to reach. */
  readonly availableTools: readonly string[];
  readonly requiresStructuredOutput: boolean;
}

/** Unicode blocks for the nine scripts Sarvam's Indic training covers. */
const INDIC_BLOCKS: ReadonlyArray<readonly [number, number]> = [
  [0x0900, 0x097f],
  [0x0980, 0x09ff],
  [0x0a00, 0x0a7f],
  [0x0a80, 0x0aff],
  [0x0b00, 0x0b7f],
  [0x0b80, 0x0bff],
  [0x0c00, 0x0c7f],
  [0x0c80, 0x0cff],
  [0x0d00, 0x0d7f],
];

/** Latin letters carrying an Indic language — the common case in Indian chat. */
const ROMANISED_MARKERS: readonly string[] = [
  "kitna",
  "kitne",
  "chahiye",
  "mujhe",
  "sasta",
  "kharidna",
  "dikhao",
  "batao",
  "paisa",
  "rupaye",
];

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

function isIndicCodePoint(code: number): boolean {
  return INDIC_BLOCKS.some(([low, high]) => code >= low && code <= high);
}

export function scriptOf(prompt: string): ScriptClass {
  let indic = 0;
  let latin = 0;
  for (const char of prompt) {
    const code = char.codePointAt(0) ?? 0;
    indic += isIndicCodePoint(code) ? 1 : 0;
    latin += /[a-z]/i.test(char) ? 1 : 0;
  }
  if (indic === 0) {
    return hasAny(prompt.toLowerCase(), ROMANISED_MARKERS) ? "mixed" : "latin";
  }
  return latin === 0 ? "indic" : "mixed";
}

/**
 * Deterministic and free. Classifying the job with a model call would put a
 * model in front of the decision about which model to use, which is both a
 * cost the cascade exists to avoid and a loop the audit trail cannot explain.
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
    script: scriptOf(input.prompt),
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
