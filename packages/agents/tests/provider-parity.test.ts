import { describe, expect, it } from "vitest";

import { F2_BLOCK_REASON } from "../src/buyer/pre-tool-use-hook.js";
import { GuardedToolDispatcher } from "../src/providers/guarded-tool-dispatcher.js";
import type { AgentSession } from "../src/shared/agent-session.js";
import {
  capturingFetch,
  jsonResponse,
  RecordingDispatcher,
} from "./doubles.js";
import { ScriptedSession } from "./doubles.js";
import { RecordingSink } from "./fakes.js";
import type { ProviderCase } from "./provider-cases.js";
import {
  hookOf,
  PROVIDER_CASES,
  runTurn,
  SPOOFED_MONEY_TOOL,
} from "./provider-cases.js";
import type { Wire } from "./provider-wire.js";
import { sentBody } from "./provider-wire.js";

function implementsPort(session: AgentSession): boolean {
  return (
    typeof session.turn === "function" && typeof session.close === "function"
  );
}

/**
 * The port is the contract the harness rests on: the scripted session (the
 * zero-credential default) and the live adapter answer the same `turn()` and
 * `close()`, and every tool call on the live adapter passes the F2 gate. What
 * the adapter does on its own wire is `provider-adapters.test.ts`'s claim.
 */
describe("every session satisfies the AgentSession port", () => {
  it.each(PROVIDER_CASES.map((kase) => [kase.id, kase] as const))(
    "%s exposes turn() and close()",
    (_id, kase: ProviderCase) => {
      const sink = new RecordingSink();
      const guard = new GuardedToolDispatcher(
        hookOf(sink),
        new RecordingDispatcher(),
        null,
      );
      const { fetch: fetchImpl } = capturingFetch([]);

      expect(implementsPort(kase.build(fetchImpl, guard))).toBe(true);
    },
  );

  it("holds for the scripted session too, the zero-credential default", () => {
    expect(implementsPort(new ScriptedSession([]))).toBe(true);
  });
});

describe("the F2 refusal on the live adapter", () => {
  it("lands in the ledger and never reaches the dispatcher", async () => {
    for (const kase of PROVIDER_CASES) {
      const run = await runTurn(kase, [
        kase.call("c1", SPOOFED_MONEY_TOOL, { amount_paise: 1 }),
        kase.text("I cannot."),
      ]);

      expect(run.sink.kinds()).toEqual(["tool.call.blocked"]);
      expect(run.guard.blocked.map((decision) => decision.reason)).toEqual([
        F2_BLOCK_REASON,
      ]);
      expect(run.dispatcher.calls).toEqual([]);
    }
  });
});

describe("conversation state survives across turns", () => {
  it.each(PROVIDER_CASES.map((kase) => [kase.id, kase] as const))(
    "%s resends the earlier turn on the second request",
    async (_id, kase: ProviderCase) => {
      const sink = new RecordingSink();
      const guard = new GuardedToolDispatcher(
        hookOf(sink),
        new RecordingDispatcher(),
        null,
      );
      const { fetch: fetchImpl, calls } = capturingFetch([
        jsonResponse(200, kase.text("First.")),
        jsonResponse(200, kase.text("Second.")),
      ]);
      const session = kase.build(fetchImpl, guard);

      await session.turn({ userMessage: "hello", toolResults: [] });
      const second = await session.turn({
        userMessage: "and again",
        toolResults: [],
      });

      expect(second.text).toBe("Second.");
      expect(historyLength(sentBody(calls[1]))).toBeGreaterThan(
        historyLength(sentBody(calls[0])),
      );

      // close() only resets the exchange; it never talks to the provider.
      await session.close();
      expect(calls).toHaveLength(2);
    },
  );
});

/** The Responses API resends history as `input`. */
function historyLength(body: Wire): number {
  const input = body["input"];
  return Array.isArray(input) ? input.length : 0;
}
