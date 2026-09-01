// @vitest-environment node
//
// A chat with an id asks its own lane's wire. The scoping is what makes
// cross-chat delivery structurally impossible: another conversation's beats
// are not filtered out, they are never sent. A chat with no id keeps the
// unscoped wire the CLI and fixture mode rely on.
import { afterEach, describe, expect, it, vi } from "vitest";

import { pollOnce } from "../src/conversation/beatPoll.ts";
import { sseUrl, stateUrl } from "../src/conversation/beatScope.ts";
import { newSession } from "../src/conversation/beatSession.ts";
import { beatSocketUrl } from "../src/conversation/beatSocket.ts";

const BASE = "http://host.invalid";

function session(chat: string | null) {
  const opened = newSession(() => undefined, BASE, chat);
  opened.seen = 7;
  opened.epoch = 3;
  return opened;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the scoped wire", () => {
  it("names the conversation on state, stream and socket", () => {
    const mine = session("cnv a/9");
    const scope = "conversation=cnv%20a%2F9";
    expect(stateUrl(mine)).toBe(`${BASE}/chat/state?${scope}`);
    expect(sseUrl(mine)).toBe(`${BASE}/chat/stream?after=7&epoch=3&${scope}`);
    expect(beatSocketUrl(BASE, 7, 3, "cnv a/9")).toContain(
      "conversation=cnv+a%2F9",
    );
  });

  it("leaves an id-less chat on the unscoped wire", () => {
    const anonymous = session(null);
    expect(stateUrl(anonymous)).toBe(`${BASE}/chat/state`);
    expect(sseUrl(anonymous)).toBe(`${BASE}/chat/stream?after=7&epoch=3`);
    expect(beatSocketUrl(BASE, 7, 3, null)).not.toContain("conversation");
  });

  it("polls the scoped state, not the shared one", async () => {
    const asked: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        asked.push(url);
        return new Response(
          JSON.stringify({
            beats: [],
            running: false,
            awaiting: [],
            conversation: "cnv_scoped",
            epoch: 3,
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }),
    );
    await pollOnce(session("cnv_scoped"));
    expect(asked).toEqual([`${BASE}/chat/state?conversation=cnv_scoped`]);
  });
});
