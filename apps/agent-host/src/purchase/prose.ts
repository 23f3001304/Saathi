/**
 * A bare JSON object is a payload, not a sentence. Only what the agent *says*
 * becomes a bubble; what it *did* becomes an activity pill. A structured
 * reply that reached this channel once put a raw intent draft — currency,
 * paise ceiling and all — into a shopper's chat as though the agent had said
 * it, so the boundary refuses one rather than trusting the layer above.
 */
export function isProse(text: string): boolean {
  const trimmed = text.trim();
  const wrapped =
    (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
    (trimmed.startsWith("[") && trimmed.endsWith("]"));
  return trimmed.length > 0 && !wrapped;
}

/** The last thing in a transcript that a person could actually be read. */
export function lastSentence(transcript: readonly string[]): string {
  return transcript.filter(isProse).at(-1)?.trim() ?? "";
}
