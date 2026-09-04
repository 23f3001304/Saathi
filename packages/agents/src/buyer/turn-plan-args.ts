import type { ToolArgs } from "../shared/tool-envelope.js";

/** The collector's argument readers: tolerant of a model's loose shapes,
 *  strict about what may become a chip or a group. */

export function textAt(args: ToolArgs, key: string): string {
  const value = args[key];
  return typeof value === "string" ? value.trim() : "";
}

/** Chips the composer may offer. Anything that is not a short string is not a
 *  tappable answer, and is dropped rather than rendered as one. */
export function groupsAt(args: ToolArgs): readonly { label: string; options: readonly string[] }[] {
  const raw = args["choice_groups"];
  if (!Array.isArray(raw)) return [];
  return raw
    .map(groupOf)
    .filter((group) => group.label !== "" && group.options.length >= 2);
}

function groupOf(item: unknown): { label: string; options: readonly string[] } {
  if (typeof item !== "object" || item === null)
    return { label: "", options: [] };
  const held = item as Record<string, unknown>;
  return {
    label: typeof held["label"] === "string" ? held["label"] : "",
    options: Array.isArray(held["options"])
      ? held["options"].filter((o): o is string => typeof o === "string")
      : [],
  };
}

/**
 * The budget axis, as one more group.
 *
 * Its bands each carry a ceiling in the schema, which is the whole point: the
 * model cannot offer "Over ₹20,000" in answer to "the most you want to spend",
 * because a band without a number does not parse. Downstream this is an
 * ordinary group - the transcript, the composer and the beat all keep the
 * shape they had - so the number's work is done by the time it gets here.
 */
export function budgetAt(
  args: ToolArgs,
): { label: string; options: readonly string[] } | null {
  const raw = args["budget"];
  if (!isRecord(raw)) return null;
  const label = typeof raw["label"] === "string" ? raw["label"] : "Budget";
  const bands = Array.isArray(raw["bands"]) ? raw["bands"] : [];
  const options = bands
    .filter(isRecord)
    .filter((band) => typeof band["ceiling_paise"] === "number")
    .map((band) => band["text"])
    .filter((text): text is string => typeof text === "string" && text !== "");
  return options.length >= 2 ? { label, options } : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function repliesAt(args: ToolArgs, key: string): readonly string[] {
  const value = args[key];
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0 && entry.length <= 60)
    .slice(0, 6);
}

/** A list of names the model wrote: skus, refs. Anything that is not a
 *  non-empty string is dropped rather than carried as a name. */
export function stringsAt(args: ToolArgs, key: string): readonly string[] {
  const value = args[key];
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

/** The budget axis as a list of nought or one, so it appends cleanly. */
export function askedBudget(
  args: ToolArgs,
): readonly { label: string; options: readonly string[] }[] {
  const asked = budgetAt(args);
  return asked === null ? [] : [asked];
}
