import { describe, expect, it } from "vitest";

import {
  COVENANT_TOOL_DECLARATIONS,
  wireNameOf,
} from "../src/providers/tool-declarations.js";
import {
  classifyTask,
  CLASS_REQUIREMENTS,
  requirementsFor,
} from "../src/routing/task-classifier.js";
import type { TaskInput } from "../src/routing/task-features.js";
import { extractFeatures } from "../src/routing/task-features.js";

const TOOLS = COVENANT_TOOL_DECLARATIONS.map(wireNameOf);

function input(prompt: string, overrides: Partial<TaskInput> = {}): TaskInput {
  return {
    prompt,
    availableTools: TOOLS,
    requiresStructuredOutput: false,
    ...overrides,
  };
}

function classOf(prompt: string, overrides: Partial<TaskInput> = {}) {
  return classifyTask(extractFeatures(input(prompt, overrides)));
}

describe("feature extraction", () => {
  it("reports no tool depth when the turn has no tools mounted", () => {
    const features = extractFeatures(
      input("find me a lamp", { availableTools: [] }),
    );
    expect(features.toolDepth).toBe(0);
  });

  it("separates a read from a negotiation from a settlement", () => {
    expect(extractFeatures(input("search the catalog")).toolDepth).toBe(1);
    expect(extractFeatures(input("get me a better price")).toolDepth).toBe(2);
    expect(extractFeatures(input("buy the brass lamp")).touchesMoney).toBe(
      true,
    );
    expect(extractFeatures(input("search the catalog")).touchesMoney).toBe(
      false,
    );
  });

  it("carries the prompt length through, which sizes the context floor", () => {
    expect(extractFeatures(input("hello")).promptChars).toBe(5);
  });
});

describe("task classification", () => {
  it("routes a settlement to money before anything else can claim it", () => {
    expect(classOf("buy the brass lamp")).toBe("money");
    expect(classOf("मुझे यह दीपक खरीदना है")).toBe("money");
  });

  it("routes haggling to negotiation and a lookup to retrieval", () => {
    expect(classOf("negotiate a discount on the lamp")).toBe("negotiation");
    expect(classOf("show me what is in the catalog")).toBe("retrieval");
  });

  it("routes toolless conversation to chat, whatever script it is in", () => {
    expect(classOf("नमस्ते, आप कैसे हैं", { availableTools: [] })).toBe("chat");
    expect(classOf("hello there", { availableTools: [] })).toBe("chat");
  });
});

describe("class requirements", () => {
  it("never lets a money turn start on the cheapest tier", () => {
    expect(CLASS_REQUIREMENTS.money.minCostTier).toBe("standard");
    expect(CLASS_REQUIREMENTS.chat.minCostTier).toBe("economy");
  });

  it("raises the context floor with the prompt, never lowers it", () => {
    const short = requirementsFor("chat", extractFeatures(input("hi")));
    expect(short.minContextWindow).toBe(
      CLASS_REQUIREMENTS.chat.minContextWindow,
    );
    const long = requirementsFor(
      "chat",
      extractFeatures(input("x".repeat(90_000))),
    );
    expect(long.minContextWindow).toBe(60_000);
  });

  it("lets a caller that needs JSON add the requirement to any class", () => {
    const features = extractFeatures(
      input("hello", { availableTools: [], requiresStructuredOutput: true }),
    );
    expect(requirementsFor("chat", features).structuredOutput).toBe(true);
  });
});
