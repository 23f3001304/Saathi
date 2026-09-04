import { describe, expect, it } from "vitest";

import {
  CLASS_EFFORT_CEILING,
  effortForClass,
} from "../src/routing/class-effort.js";
import { TASK_CLASSES } from "../src/routing/task-classifier.js";

describe("how hard a turn of each class thinks", () => {
  it("lowers the one decision that does not need the thinking", () => {
    expect(effortForClass("retrieval", "high")).toBe("low");
    expect(effortForClass("retrieval", "medium")).toBe("low");
  });

  /** The ask is the front door: it is where the agent composes the one
   *  question it gets, and cheapening that was never the point. */
  it("leaves a chat turn exactly as the operator asked", () => {
    expect(effortForClass("chat", "high")).toBe("high");
    expect(effortForClass("chat", "medium")).toBe("medium");
  });

  it("leaves money and negotiation alone", () => {
    expect(effortForClass("money", "high")).toBe("high");
    expect(effortForClass("negotiation", "high")).toBe("high");
  });

  it("is a ceiling and never a raise", () => {
    for (const taskClass of TASK_CLASSES) {
      expect(effortForClass(taskClass, "low")).toBe("low");
    }
  });

  it("has a ceiling for every class the router can produce", () => {
    for (const taskClass of TASK_CLASSES) {
      expect(CLASS_EFFORT_CEILING[taskClass]).toBeDefined();
    }
  });
});
