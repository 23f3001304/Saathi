// The router read its own prompt. `TURN_PLAN_PROMPT` says "purchase" seven
// times, and `requestOf` classified the whole `userMessage` — so every turn,
// including "hi", came out `money` and bought a second self-consistency sample
// nobody needed. Instructions are ours; the request is data. The router
// classifies the data.
import { describe, expect, it } from "vitest";

import { classifyTask } from "../src/routing/task-classifier.js";
import { extractFeatures } from "../src/routing/task-features.js";

const TOOLS = ["answer_shopper", "propose_purchase"];

function classOf(prompt: string): string {
  return classifyTask(
    extractFeatures({
      prompt,
      availableTools: TOOLS,
      requiresStructuredOutput: false,
    }),
  );
}

const HARNESS =
  "You decide what this turn is. Use propose_purchase when the shopper " +
  "wants to buy something and the purchase can be bounded.";

describe("classifying the shopper's sentence", () => {
  it("does not call a greeting a money turn", () => {
    expect(classOf("hi")).not.toBe("money");
  });

  it("still calls an actual purchase a money turn", () => {
    expect(classOf("buy me navy running shoes under 4000")).toBe("money");
  });

  it("would have been fooled by the harness prompt, which is the bug", () => {
    expect(classOf(`${HARNESS}\n\nhi`)).toBe("money");
    expect(classOf("hi")).not.toBe("money");
  });
});
