import { describe, expect, it } from "vitest";

import { GuardedToolDispatcher } from "../src/providers/guarded-tool-dispatcher.js";
import type { AgentSession, AgentTurn } from "../src/shared/agent-session.js";
import {
  capturingFetch,
  jsonResponse,
  RecordingDispatcher,
} from "./doubles.js";
import { ScriptedSession } from "./doubles.js";
import { RecordingSink } from "./fakes.js";
import type { ProviderCase } from "./provider-cases.js";
import {
  GATEWAY_TOOL,
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

function distinct(values: readonly unknown[]): number {
  return new Set(values.map((value) => JSON.stringify(value))).size;
}

/**
 * Parity is the claim the whole provider layer rests on: swapping
 * `COVENANT_AGENT_PROVIDER` must change who answers, and nothing else. These
 * tests assert sameness across adapters rather than re-asserting each
 * adapter's own behaviour, which `provider-adapters.test.ts` already covers.
 */
describe("every adapter satisfies the AgentSession port", () => {
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

describe("providers agree on the answer", () => {
  it("returns the identical AgentTurn for the same conversation", async () => {
    const turns: AgentTurn[] = [];
    for (const kase of PROVIDER_CASES) {
      const run = await runTurn(kase, [
        kase.call("c1", GATEWAY_TOOL, { cart_mandate_jwt: "jwt" }),
        kase.text("Cart approved."),
      ]);
      turns.push(run.turn);
    }

    expect(distinct(turns)).toBe(1);
    expect(turns[0]).toEqual({
      text: "Cart approved.",
      toolRequests: [],
      done: true,
    });
  });
});

describe("providers agree on the F2 refusal", () => {
  it("produces the identical decision and ledger trail", async () => {
    const refusals: unknown[] = [];
    const kinds: unknown[] = [];
    for (const kase of PROVIDER_CASES) {
      const run = await runTurn(kase, [
        kase.call("c1", SPOOFED_MONEY_TOOL, { amount_paise: 1 }),
        kase.text("I cannot."),
      ]);
      refusals.push(
        run.guard.blocked.map((decision) => ({
          allowed: decision.allowed,
          moneyAffecting: decision.moneyAffecting,
          reason: decision.reason,
          human: decision.human,
        })),
      );
      kinds.push(run.sink.kinds());
    }

    expect(distinct(refusals)).toBe(1);
    expect(distinct(kinds)).toBe(1);
    expect(kinds[0]).toEqual(["tool.call.blocked"]);
  });

  it("never reaches the dispatcher without the gate, on any provider", async () => {
    for (const kase of PROVIDER_CASES) {
      const run = await runTurn(kase, [
        kase.call("c1", SPOOFED_MONEY_TOOL, {}),
        kase.text("I cannot."),
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

/** `input` on OpenAI/Gemini, `messages` on Chat Completions. */
function historyLength(body: Wire): number {
  const input = body["input"];
  const messages = body["messages"];
  if (Array.isArray(input)) {
    return input.length;
  }
  return Array.isArray(messages) ? messages.length : 0;
}
