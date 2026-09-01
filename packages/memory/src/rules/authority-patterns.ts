/**
 * Versioned release artifact, `v1` (§9.1). Tuning it is a reviewable diff.
 *
 * R4 is a labeller, not the defence (decision 39): stages 1 and 2 already make
 * poisoned text incapable of touching a constraint, and the regex being
 * non-load-bearing is exactly why it is safe to ship a regex.
 */
export const AUTHORITY_PATTERNS = [
  /\b(system|assistant|developer)\s*:/i,
  /\bpre[-\s]?approved\b/i,
  /\b(raise|increase|update|override|ignore|disregard)\b.{0,24}\b(limit|cap|budget|constraint|rule)s?\b/i,
  /\bauthoriz(?:e|ed|ation)\b.{0,16}\bup to\b/i,
  /\byou (?:are|must|should) (?:now )?(?:allowed|permitted|authorized)\b/i,
  /\b(?:new|updated) (?:spending|purchase) (?:limit|policy)\b/i,
] as const;

export const AUTHORITY_PATTERNS_VERSION = "v1";

/** The harness threat this labels, carried into `memory.write.rejected`. */
export const CONTEXT_POISONING_ATTACK_ID = "T-1";

export function matchingAuthorityPattern(serialized: string): number | null {
  const index = AUTHORITY_PATTERNS.findIndex((pattern) =>
    pattern.test(serialized),
  );
  return index === -1 ? null : index;
}
