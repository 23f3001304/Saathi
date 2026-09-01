export type JsonRecord = Readonly<Record<string, unknown>>;

/**
 * Small readers for provider response bodies.
 *
 * Every one of these answers "absent" rather than throwing. A provider that
 * adds a field, renames a step type or returns a shape this adapter has not
 * seen must degrade to "no text, no tool calls" — never to an exception
 * escaping mid-conversation, and never to a tool call synthesised out of a
 * field that was not actually there.
 */
export function asRecord(value: unknown): JsonRecord | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

export function asArray(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? (value as readonly unknown[]) : [];
}

/** The string at `key`, or `""` when it is absent or not a string. */
export function stringAt(record: JsonRecord, key: string): string {
  const value = record[key];
  return typeof value === "string" ? value : "";
}

/** The records in the array at `key`, skipping anything that is not one. */
export function recordsAt(
  record: JsonRecord,
  key: string,
): readonly JsonRecord[] {
  const found: JsonRecord[] = [];
  for (const entry of asArray(record[key])) {
    const parsed = asRecord(entry);
    if (parsed !== null) {
      found.push(parsed);
    }
  }
  return found;
}

/** Concatenates `text` off content blocks whose `type` is `blockType`. */
export function textOfBlocks(
  record: JsonRecord,
  key: string,
  blockType: string,
): string {
  return recordsAt(record, key)
    .filter((block) => stringAt(block, "type") === blockType)
    .map((block) => stringAt(block, "text"))
    .join("");
}
