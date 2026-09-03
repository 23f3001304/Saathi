import type { CostTier } from "./model-catalog.js";
import type { TaskFeatures } from "./task-features.js";

export const TASK_CLASSES = [
  "chat",
  "retrieval",
  "negotiation",
  "money",
] as const;

export type TaskClass = (typeof TASK_CLASSES)[number];

export interface ClassRequirements {
  readonly toolCalling: boolean;
  readonly structuredOutput: boolean;
  readonly minContextWindow: number;
  readonly minCostTier: CostTier;
}

/**
 * What a class needs a model to be able to do. This is a *capability* floor and
 * nothing else: it can make the router refuse to send a job to a model that
 * cannot hold it, and it can never make a model allowed to do more. What is
 * permitted is `PreToolUseHook`'s answer, on every rung, unchanged.
 */
export const CLASS_REQUIREMENTS: Readonly<
  Record<TaskClass, ClassRequirements>
> = {
  chat: {
    toolCalling: false,
    structuredOutput: false,
    minContextWindow: 8_192,
    minCostTier: "economy",
  },
  retrieval: {
    toolCalling: true,
    structuredOutput: false,
    minContextWindow: 32_768,
    minCostTier: "economy",
  },
  negotiation: {
    toolCalling: true,
    structuredOutput: true,
    minContextWindow: 32_768,
    minCostTier: "economy",
  },
  money: {
    toolCalling: true,
    structuredOutput: true,
    // A settlement turn does not start on the cheapest thing with a pulse.
    minContextWindow: 32_768,
    minCostTier: "standard",
  },
};

/**
 * Money first, because a turn that settles is a money turn whether or not the
 * caller happened to mount the gateway tools this time; then by how deep the
 * tools go. Everything else is conversation.
 */
export function classifyTask(features: TaskFeatures): TaskClass {
  if (features.touchesMoney) {
    return "money";
  }
  if (features.toolDepth >= 2) {
    return "negotiation";
  }
  if (features.toolDepth === 1) {
    return "retrieval";
  }
  return "chat";
}

/** ~3 characters per token, doubled to leave room for the reply and tools. */
const CHARS_PER_TOKEN = 3;
const CONTEXT_HEADROOM = 2;

export function requirementsFor(
  taskClass: TaskClass,
  features: TaskFeatures,
): ClassRequirements {
  const base = CLASS_REQUIREMENTS[taskClass];
  const needed = (features.promptChars / CHARS_PER_TOKEN) * CONTEXT_HEADROOM;
  return {
    ...base,
    structuredOutput: base.structuredOutput || features.structuredOutput,
    minContextWindow: Math.max(base.minContextWindow, Math.ceil(needed)),
  };
}
