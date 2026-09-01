import { describe, expect, it } from "vitest";

import { MoneyToolRegistry } from "../src/buyer/money-tool-registry.js";
import { PreToolUseHook } from "../src/buyer/pre-tool-use-hook.js";
import { ClaudeAgentSession } from "../src/sdk/claude-agent-session.js";
import { hasApiKey, resolveModel } from "../src/sdk/model.js";
import { RecordingLogger, RecordingSink, RecordingTracer } from "./fakes.js";

const live = hasApiKey(process.env);

/**
 * The real SDK adapter is smoke-tested only when a key is present, the same
 * shape as the Razorpay live test. Without one the suite skips and says so in
 * the reporter — a CI box with no credentials still goes green, and no rule in
 * this package depends on this file running.
 */
describe.skipIf(!live)(
  "ClaudeAgentSession live smoke (ANTHROPIC_API_KEY set)",
  () => {
    it(
      "completes one turn against the configured model",
      { timeout: 180_000 },
      async () => {
        const hook = new PreToolUseHook(
          new MoneyToolRegistry(),
          new RecordingSink(),
          new RecordingLogger(),
          new RecordingTracer(),
          { tenantId: "tnt_demo", attackId: null },
        );
        const session = new ClaudeAgentSession(
          hook,
          {
            model: resolveModel(process.env),
            systemPrompt: "Answer with a single word.",
            allowedTools: [],
            mcpServers: {},
            maxTurns: 1,
            cwd: process.cwd(),
          },
          null,
        );

        const turn = await session.turn({
          userMessage: "Reply with the word: covenant",
          toolResults: [],
        });
        await session.close();

        expect(turn.text.length).toBeGreaterThan(0);
        expect(turn.done).toBe(true);
      },
    );
  },
);

describe("ClaudeAgentSession live smoke gate", () => {
  it(`is ${live ? "running" : "skipped: set ANTHROPIC_API_KEY to run it"}`, () => {
    expect(typeof live).toBe("boolean");
  });
});
