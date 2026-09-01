// @vitest-environment node
//
// The lane list on the shelf: a chat that is not on screen wears one badge
// (the ask beats the place in line beats "working"), and the first parked
// event is what asks for notification permission, never page load.
import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchLanes, type LaneRow } from "../src/api/lanes.ts";
import { notifyAttention } from "../src/conversation/attentionNotify.ts";
import { badgesFor } from "../src/conversation/laneBadges.ts";
import type { ChatSessionMeta } from "../src/conversation/ChatHistory.tsx";

const BASE = "http://host.invalid";

function meta(id: number, conversationId: string | null): ChatSessionMeta {
  return {
    id,
    startedAt: "9:00",
    title: `Chat ${id}`,
    status: "in-progress",
    group: "Chats",
    archived: false,
    conversationId,
  };
}

function row(overrides: Partial<LaneRow>): LaneRow {
  return {
    conversation: null,
    running: false,
    queued: null,
    attention: null,
    ...overrides,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("folding the lane list onto the shelf", () => {
  it("wears the ask first, then the place in line, then the work", () => {
    const lanes = new Map([
      ["cnv_q", row({ conversation: "cnv_q", attention: "question" })],
      ["cnv_l", row({ conversation: "cnv_l", queued: 2 })],
      ["cnv_r", row({ conversation: "cnv_r", running: true })],
    ]);
    const badges = badgesFor(
      [meta(1, "cnv_q"), meta(2, "cnv_l"), meta(3, "cnv_r"), meta(4, null)],
      lanes,
    );
    expect(badges.get(1)).toEqual({ label: "needs an answer", tone: "attention" });
    expect(badges.get(2)).toEqual({ label: "in line, #2", tone: "queued" });
    expect(badges.get(3)).toEqual({ label: "working", tone: "running" });
    expect(badges.get(4)).toBeUndefined();
  });

});

describe("reading the lane list off the wire", () => {
  it("keeps only well-formed lane rows", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            ok: true,
            lanes: [
              { conversation: "cnv_a", running: true, queued: null, attention: "pick" },
              { conversation: null, running: false, queued: null, attention: null },
              "not a row",
            ],
          }),
          { status: 200 },
        ),
      ),
    );
    const rows = await fetchLanes(BASE);
    expect(rows).toHaveLength(2);
    expect(rows[0]?.attention).toBe("pick");
  });

  it("answers an unreachable host with an empty list, never a throw", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new Error("down"))));
    expect(await fetchLanes(BASE)).toEqual([]);
  });
});

type Shown = { title: string; options: { body?: string; tag?: string } };

function stubNotification(permission: string, shown: Shown[]): {
  asked: () => number;
} {
  let requests = 0;
  class FakeNotification {
    static permission = permission;
    static requestPermission(): Promise<string> {
      requests += 1;
      FakeNotification.permission = "granted";
      return Promise.resolve("granted");
    }
    onclick: (() => void) | null = null;
    close(): void {}
    constructor(title: string, options: { body?: string; tag?: string }) {
      shown.push({ title, options });
    }
  }
  vi.stubGlobal("Notification", FakeNotification);
  return { asked: () => requests };
}

describe("the parked-lane notification", () => {
  it("shows what is needed, tagged by chat so asks replace, not stack", () => {
    const shown: Shown[] = [];
    stubNotification("granted", shown);
    notifyAttention("pick", "1TB SSDs", () => undefined);
    expect(shown[0]?.title).toBe("Saathi needs a pick");
    expect(shown[0]?.options.body).toContain("1TB SSDs");
    expect(shown[0]?.options.tag).toBe("covenant-attention-1TB SSDs");
  });

  it("asks for permission on the first parked event, then shows", async () => {
    const shown: Shown[] = [];
    const stub = stubNotification("default", shown);
    notifyAttention("question", "Kurta hunt", () => undefined);
    await Promise.resolve();
    expect(stub.asked()).toBe(1);
    expect(shown).toHaveLength(1);
  });

  it("stays silent when the person already said no", () => {
    const shown: Shown[] = [];
    const stub = stubNotification("denied", shown);
    notifyAttention("sign", "Kurta hunt", () => undefined);
    expect(stub.asked()).toBe(0);
    expect(shown).toHaveLength(0);
  });
});
