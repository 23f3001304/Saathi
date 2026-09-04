import type { ReasoningEffort } from "../providers/openai-request.js";
import type { TaskClass } from "./task-classifier.js";

/** Cheapest first. A ceiling is "no more than this", so order matters. */
const ORDER: readonly ReasoningEffort[] = ["low", "medium", "high"];

/**
 * How hard a turn of each class is worth thinking about.
 *
 * DECISION: a ceiling per class rather than one number for the whole host.
 * Reasoning effort was a single environment value applied to every call, so
 * deciding "go and look on the open web" - one move, off a classification the
 * router has already made - thought exactly as hard as drafting a payment.
 * Measured on the demo machine, that one decision was 12 of a 45-second
 * errand.
 *
 * `retrieval` is the only class lowered, and only to the floor: its planner
 * turn picks a move and writes a search query, and the schema it fills is
 * enforced on the wire now rather than hoped for in prose. Everything else
 * keeps whatever the operator asked for. `chat` in particular is NOT lowered:
 * a chat turn is where the agent composes the one question it gets to ask, and
 * that question is the front door of the product.
 *
 * It is a ceiling, not an assignment, so asking for `low` everywhere still
 * gets `low` everywhere. Nothing here can raise effort above what was asked.
 */
export const CLASS_EFFORT_CEILING: Readonly<Record<TaskClass, ReasoningEffort>> =
  {
    chat: "high",
    retrieval: "low",
    negotiation: "high",
    money: "high",
  };

export function effortForClass(
  taskClass: TaskClass,
  configured: ReasoningEffort,
): ReasoningEffort {
  const ceiling = CLASS_EFFORT_CEILING[taskClass];
  return ORDER.indexOf(configured) <= ORDER.indexOf(ceiling)
    ? configured
    : ceiling;
}
