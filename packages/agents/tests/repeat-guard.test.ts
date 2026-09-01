// A model rediscovering a wall is a model making no progress. The old guard
// compared a round against the one before it, so it saw a question asked twice
// running and nothing else — and a live errand looped three rounds wide,
// silently, until it died on the page it had already failed to read.
import { describe, expect, it } from "vitest";

import { RepeatGuard } from "../src/providers/repeat-guard.js";
import type {
  AgentToolRequest,
  AgentToolResult,
} from "../src/shared/agent-session.js";

function call(id: string, tool: string, args = {}): AgentToolRequest {
  return { toolUseId: id, tool, server: "covenant_web", args };
}

function failed(...ids: readonly string[]): AgentToolResult[] {
  return ids.map((id) => ({ toolUseId: id, content: "no", isError: true }));
}

function ok(...ids: readonly string[]): AgentToolResult[] {
  return ids.map((id) => ({ toolUseId: id, content: "yes", isError: false }));
}

describe("no progress ends the round", () => {
  it("catches the same call repeated straight away", () => {
    const guard = new RepeatGuard();
    const round = [call("a", "web_read")];

    expect(guard.noProgress(round)).toBe(false);
    guard.record(round, ok("a"));
    expect(guard.noProgress([call("b", "web_read")])).toBe(true);
  });

  it("catches a failed call re-attempted across a cycle", () => {
    const guard = new RepeatGuard();
    const page = { url: "https://www.amazon.in/Crucial-P310/dp/B0D1" };
    const first = [call("a", "web_open", page)];

    // open → search → open, three rounds wide: no two consecutive rounds are
    // the same, so the old guard never fired once.
    expect(guard.noProgress(first)).toBe(false);
    guard.record(first, failed("a"));
    const search = [call("b", "web_search", { query: "1TB NVMe" })];
    expect(guard.noProgress(search)).toBe(false);
    guard.record(search, ok("b"));

    expect(guard.noProgress([call("c", "web_open", page)])).toBe(true);
  });
});

describe("progress is not punished", () => {
  it("lets a call that succeeded be made again", () => {
    const guard = new RepeatGuard();
    const home = [call("a", "web_open", { url: "https://www.amazon.in" })];

    expect(guard.noProgress(home)).toBe(false);
    guard.record(home, ok("a"));
    const other = [call("b", "web_read")];
    guard.noProgress(other);
    guard.record(other, ok("b"));

    // A checkout walks back through pages it has seen; only a page that
    // refused to be read is a wall.
    expect(
      guard.noProgress([
        call("c", "web_open", { url: "https://www.amazon.in" }),
      ]),
    ).toBe(false);
  });

  it("lets a round through when any part of it is new", () => {
    const guard = new RepeatGuard();
    const first = [call("a", "web_read")];
    guard.noProgress(first);
    guard.record(first, failed("a"));

    expect(
      guard.noProgress([call("b", "web_read"), call("c", "web_cart")]),
    ).toBe(false);
  });
});
