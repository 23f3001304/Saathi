import type { ManipulationKind, PatternSpec } from "./patterns.js";
import { PATTERNS } from "./patterns.js";

export interface ManipulationCue {
  readonly kind: ManipulationKind;
  /** The words that matched, so the finding can be shown rather than asserted. */
  readonly phrase: string;
  readonly bias: string;
  readonly counter: string;
}

export interface ManipulationReport {
  readonly cues: readonly ManipulationCue[];
  readonly kinds: readonly ManipulationKind[];
}

/** A page can repeat "hurry" twenty times; that is one finding, not twenty. */
function firstMatch(text: string, spec: PatternSpec): string | null {
  for (const cue of spec.cues) {
    const found = cue.exec(text);
    if (found !== null && found[0].trim() !== "") return found[0].trim();
  }
  return null;
}

/**
 * Reads merchant-authored text and names the persuasion in it.
 *
 * Deterministic on purpose. The agent's resistance to a countdown timer must
 * not depend on the agent noticing the countdown timer — an instruction in a
 * prompt is exactly the surface that prompt injection attacks, and a shield
 * that can be argued with is not one. This runs below the model, on the same
 * text the model will read, and its finding is recorded whatever the model
 * subsequently decides.
 *
 * It returns findings, never a verdict. Nothing here blocks a purchase: the
 * covenant bounds the money, and this bounds what the merchant's prose is
 * allowed to be worth — which is nothing.
 */
export function detectManipulation(text: string): ManipulationReport {
  if (text.trim() === "") return { cues: [], kinds: [] };
  const cues: ManipulationCue[] = [];
  for (const spec of PATTERNS) {
    const phrase = firstMatch(text, spec);
    if (phrase === null) continue;
    cues.push({
      kind: spec.kind,
      phrase,
      bias: spec.bias,
      counter: spec.counter,
    });
  }
  return { cues, kinds: cues.map((cue) => cue.kind) };
}

/**
 * The whole listing, not one field. A shop that keeps its scarcity copy in the
 * title and its fees in the description is running two patterns, not none.
 */
export function detectAcross(
  parts: readonly (string | null | undefined)[],
): ManipulationReport {
  return detectManipulation(parts.filter(Boolean).join(" \n "));
}
