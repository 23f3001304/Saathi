import type { AgentToolRequest } from "../shared/agent-session.js";
import type { ToolDeclaration } from "../providers/tool-declarations.js";
import { wireNameOf } from "../providers/tool-declarations.js";
import type { SchemaOutcome, ToolArgsOutcome } from "./confidence-signals.js";

/** A ```json fence, or a bare object anywhere in the text. */
const FENCED = /```(?:json)?\s*([\s\S]*?)```/;
const BRACED = /\{[\s\S]*\}/;

function parses(candidate: string): boolean {
  try {
    return typeof JSON.parse(candidate) === "object";
  } catch {
    return false;
  }
}

function repaired(text: string): string | null {
  return FENCED.exec(text)?.[1] ?? BRACED.exec(text)?.[0] ?? null;
}

/**
 * "First try" means the whole reply was the object. "After repair" means we had
 * to cut a fence or a brace pair out of prose to find it — which is a working
 * answer and a weaker signal, so it scores lower rather than passing or failing.
 */
export function schemaOutcomeOf(
  text: string,
  required: boolean,
): SchemaOutcome {
  if (!required) {
    return "not_required";
  }
  if (parses(text.trim())) {
    return "first_try";
  }
  const salvaged = repaired(text);
  if (salvaged !== null && parses(salvaged.trim())) {
    return "after_repair";
  }
  return "failed";
}

function requiredKeysOf(declaration: ToolDeclaration): readonly string[] {
  const required = declaration.parameters["required"];
  return Array.isArray(required)
    ? required.filter((key): key is string => typeof key === "string")
    : [];
}

function wellFormed(
  request: AgentToolRequest,
  declarations: readonly ToolDeclaration[],
): boolean {
  const declaration = declarations.find(
    (candidate) =>
      wireNameOf(candidate) === `mcp__${request.server}__${request.tool}`,
  );
  if (declaration === undefined) {
    return false;
  }
  return requiredKeysOf(declaration).every((key) => key in request.args);
}

/**
 * In-bounds means "every argument the declaration marks required is present".
 * It is deliberately not a full schema check: each tool re-verifies its own AM2
 * envelope, and a second validator here would drift from the first one.
 *
 * `required` says the turn's whole answer *is* a tool call — the planner
 * choosing its move. Calling nothing is then a failed answer and not an
 * abstention, which is the difference between escalating off a rung that could
 * not decide and accepting it with a perfect score for having decided nothing.
 */
export function toolArgsOutcomeOf(
  requests: readonly AgentToolRequest[],
  declarations: readonly ToolDeclaration[],
  required = false,
): ToolArgsOutcome {
  if (requests.length === 0) {
    return required ? "none" : "not_required";
  }
  const good = requests.filter((request) =>
    wellFormed(request, declarations),
  ).length;
  if (good === requests.length) {
    return "all";
  }
  return good === 0 ? "none" : "some";
}

/** Letters and digits in any script: a Devanagari answer tokenises like a
 *  Latin one, which is the point of the signal being cross-lingual at all. */
const WORD_BREAK = /[^\p{L}\p{N}]+/gu;

/** Jaccard overlap of the word sets — the cheap half of self-consistency. */
export function agreementOf(first: string, second: string): number {
  const left = wordsOf(first);
  const right = wordsOf(second);
  if (left.size === 0 && right.size === 0) {
    return 1;
  }
  const shared = [...left].filter((word) => right.has(word)).length;
  const union = new Set([...left, ...right]).size;
  return union === 0 ? 0 : shared / union;
}

function wordsOf(text: string): ReadonlySet<string> {
  return new Set(
    text
      .toLowerCase()
      .split(WORD_BREAK)
      .filter((word) => word.length > 0),
  );
}
