import { describe, expect, it } from "vitest";

import { GuardedToolDispatcher } from "../src/providers/guarded-tool-dispatcher.js";
import { MoneyToolRegistry } from "../src/buyer/money-tool-registry.js";
import { PreToolUseHook } from "../src/buyer/pre-tool-use-hook.js";
import type { AgentToolRequest } from "../src/shared/agent-session.js";
import type { ToolCall, ToolOutcome } from "../src/shared/tool-envelope.js";

const SERVER = "covenant_web";

/** Records when each call started and finished, so overlap is observable. */
class Recorder {
  readonly spans: { tool: string; at: number; done: number }[] = [];
  private tick = 0;

  dispatcher(holdFor: number) {
    return {
      dispatch: async (call: ToolCall): Promise<ToolOutcome> => {
        const at = (this.tick += 1);
        const span = { tool: call.tool, at, done: -1 };
        this.spans.push(span);
        for (let i = 0; i < holdFor; i += 1) await Promise.resolve();
        span.done = (this.tick += 1);
        return { content: JSON.stringify({ tool: call.tool }), isError: false };
      },
    };
  }

  /** True when any two of the named tools were in flight at the same time. */
  overlapped(a: string, b: string): boolean {
    const x = this.spans.find((s) => s.tool === a);
    const y = this.spans.find((s) => s.tool === b);
    if (x === undefined || y === undefined) return false;
    return x.at < y.done && y.at < x.done;
  }
}

function ask(tool: string, id: string): AgentToolRequest {
  return { toolUseId: id, tool, server: SERVER, args: {} };
}

function guardOver(
  recorder: Recorder,
  parallel: readonly string[],
  holdFor = 3,
): GuardedToolDispatcher {
  return new GuardedToolDispatcher(
    new PreToolUseHook(
      new MoneyToolRegistry(),
      { append: () => "evt_test" },
      {
        debug: () => undefined,
        info: () => undefined,
        warn: () => undefined,
        error: () => undefined,
        fatal: () => undefined,
      },
      { startSpan: () => ({ end: () => undefined, setStatus: () => undefined }) } as never,
      { tenantId: "tnt_demo", attackId: null },
    ),
    recorder.dispatcher(holdFor),
    null,
    new Set(parallel),
  );
}

describe("dispatching a turn's tool calls", () => {
  it("runs read-only calls beside each other", async () => {
    const rec = new Recorder();
    const guard = guardOver(rec, ["web_verify", "app_state"]);
    await guard.dispatchAll([ask("web_verify", "t1"), ask("app_state", "t2")]);
    expect(rec.overlapped("web_verify", "app_state")).toBe(true);
  });

  it("keeps anything not declared parallel strictly in order", async () => {
    const rec = new Recorder();
    const guard = guardOver(rec, ["web_verify"]);
    await guard.dispatchAll([ask("web_open", "t1"), ask("web_read", "t2")]);
    expect(rec.overlapped("web_open", "web_read")).toBe(false);
  });

  it("returns results in the order the model asked, not the order they finished", async () => {
    const rec = new Recorder();
    const guard = guardOver(rec, ["web_verify", "app_state", "see_shelf"]);
    const results = await guard.dispatchAll([
      ask("web_verify", "t1"),
      ask("app_state", "t2"),
      ask("see_shelf", "t3"),
    ]);
    expect(results.map((r) => r.toolUseId)).toEqual(["t1", "t2", "t3"]);
  });
});

describe("a serial call among parallel ones", () => {
  /** The ledger has to read back in the order it happened, so a call that
   *  changes something is a barrier: everything before it is finished, and
   *  nothing after it has started. */
  it("is a barrier nothing crosses", async () => {
    const rec = new Recorder();
    const guard = guardOver(rec, ["web_verify", "app_state"]);
    await guard.dispatchAll([
      ask("web_verify", "t1"),
      ask("web_open", "t2"),
      ask("app_state", "t3"),
    ]);
    expect(rec.overlapped("web_verify", "web_open")).toBe(false);
    expect(rec.overlapped("web_open", "app_state")).toBe(false);
  });

  it("still records every call the model asked for, in order", async () => {
    const rec = new Recorder();
    const guard = guardOver(rec, ["web_verify", "app_state"]);
    await guard.dispatchAll([
      ask("web_verify", "t1"),
      ask("web_open", "t2"),
      ask("app_state", "t3"),
    ]);
    expect(guard.seen.map((r) => r.tool)).toEqual([
      "web_verify",
      "web_open",
      "app_state",
    ]);
  });
});

describe("a dispatcher told nothing may run in parallel", () => {
  it("behaves exactly as it always did", async () => {
    const rec = new Recorder();
    const guard = guardOver(rec, []);
    const results = await guard.dispatchAll([
      ask("web_verify", "t1"),
      ask("app_state", "t2"),
    ]);
    expect(rec.overlapped("web_verify", "app_state")).toBe(false);
    expect(results.map((r) => r.toolUseId)).toEqual(["t1", "t2"]);
  });
});
