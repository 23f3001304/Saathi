import { describe, expect, it } from "vitest";

import { GuardedToolDispatcher } from "../src/providers/guarded-tool-dispatcher.js";
import type {
  ProviderExchange,
  ProviderReply,
} from "../src/providers/provider-turn-loop.js";
import { runGuardedTurn } from "../src/providers/provider-turn-loop.js";
import { SpokenArguments } from "../src/providers/spoken-arguments.js";
import type { Draft } from "../src/providers/turn-stream.js";
import { CoalescingStream, SUPERSEDED } from "../src/providers/turn-stream.js";
import { RecordingDispatcher } from "./doubles.js";
import { RecordingSink } from "./fakes.js";
import { hookOf } from "./provider-cases.js";
import { collector, recordingScope, scopeOf, sse } from "./stream-fixtures.js";

const CATALOG_CALL = {
  toolUseId: "call_1",
  tool: "catalog_search",
  server: "covenant_merchant",
  args: {},
};

describe("sse framing", () => {
  it("reads named events, comments and multi-line data across chunks", async () => {
    const frames = [];
    for await (const frame of sse(
      ': keep-alive\n\nevent: one\ndata: {"a":1}\n\ndata: line\ndata: two\n\n',
    )) {
      frames.push(frame);
    }

    expect(frames).toEqual([
      { event: "one", data: '{"a":1}' },
      { event: null, data: "line\ntwo" },
    ]);
  });
});

/**
 * The field is prose the shopper reads; everything else in the arguments is a
 * decision, and a decision is never taken from a half-arrived object.
 */
describe("spoken arguments", () => {
  it("reveals the reply as it arrives and nothing else", () => {
    const reader = new SpokenArguments();
    const shown = [
      '{"',
      "reply",
      '":"',
      "Hi",
      " there",
      '","',
      "reason",
      '":"',
      "greeting only",
      '"}',
    ]
      .map((fragment) => reader.push(fragment))
      .join("");

    expect(shown).toBe("Hi there");
  });

  it("holds back an escape that is still arriving", () => {
    const reader = new SpokenArguments();
    expect(reader.push('{"reply":"line\\')).toBe("line");
    expect(reader.push("n2")).toBe("\n2");
  });

  it("says nothing for a tool that has no reply field", () => {
    const reader = new SpokenArguments();
    expect(reader.push('{"cart_mandate_jwt":"ey.J.x","txn_id":"t1"}')).toBe("");
  });
});

class BlockingExchange implements ProviderExchange {
  sends = 0;
  appendUser(): void {}
  appendToolResults(): void {}
  reset(): void {}
  async send(): Promise<ProviderReply> {
    this.sends += 1;
    return { text: "done", toolRequests: [] };
  }
}

describe("the port carries both", () => {
  it("uses the blocking send for an adapter that declares no streaming", async () => {
    const exchange = new BlockingExchange();
    const guard = new GuardedToolDispatcher(
      hookOf(new RecordingSink()),
      new RecordingDispatcher(),
      null,
    );
    const stream = collector();

    const turn = await runGuardedTurn(
      exchange,
      guard,
      { userMessage: "hello", toolResults: [] },
      4,
      scopeOf(stream),
    );

    expect(turn.text).toBe("done");
    expect(exchange.sends).toBe(1);
    expect(stream.seen).toEqual([]);
  });
});

/** Two round trips in one turn: prose, a tool call, then prose again. */
class TwoTripExchange implements ProviderExchange {
  private trip = 0;
  appendUser(): void {}
  appendToolResults(): void {}
  reset(): void {}
  async send(): Promise<ProviderReply> {
    return { text: "", toolRequests: [] };
  }
  async sendStreaming(stream: Draft): Promise<ProviderReply> {
    this.trip += 1;
    if (this.trip === 1) {
      stream.delta("shall I look?");
      return { text: "shall I look?", toolRequests: [CATALOG_CALL] };
    }
    stream.delta("here is what I found.");
    return { text: "here is what I found.", toolRequests: [] };
  }
}

/**
 * The defect this pins: both round trips streamed into one draft, so the
 * preamble and the answer arrived as one sentence with no join — "…see the
 * options?You requested…". One draft per round trip, and the second silently
 * supersedes the first once it has something to put in its place.
 */
describe("a turn that takes two round trips", () => {
  it("opens a draft each and supersedes the first without a notice", async () => {
    const drafts = recordingScope();
    await runGuardedTurn(
      new TwoTripExchange(),
      new GuardedToolDispatcher(
        hookOf(new RecordingSink()),
        new RecordingDispatcher(),
        null,
      ),
      { userMessage: "shoes", toolResults: [] },
      4,
      drafts.scope,
    );

    expect(drafts.opened).toEqual([
      { text: "shall I look?", verdict: SUPERSEDED },
      { text: "here is what I found.", verdict: "settled" },
    ]);
  });
});

describe("coalescing", () => {
  it("flushes on word boundaries and keeps every character", () => {
    const out = collector();
    const stream = new CoalescingStream(out.delta);
    for (const token of "the quick brown fox jumped".split(/(?= )/)) {
      stream.delta(token);
    }
    stream.close();

    expect(out.seen.join("")).toBe("the quick brown fox jumped");
    expect(out.seen.length).toBeLessThan(5);
  });
});
