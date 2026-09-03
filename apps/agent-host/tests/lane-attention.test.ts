// What the lane list says a parked run is waiting on. Derived from what the
// harness observed: the gates, the window, and the run's own closing beat.
// Never from a model's claim to have asked something.
import { describe, expect, it } from "vitest";

import type { BrowserService } from "../src/browser/browser-service.js";
import { ChatLanes } from "../src/http/chat-lanes.js";
import { attentionOf, lanesReport } from "../src/http/lane-attention.js";
import { riggedLane, type RiggedLane } from "./support/lane-rig.js";

function handedOver(lane: RiggedLane): RiggedLane {
  const view = {
    id: "web_1",
    sandbox: { surface: "container" as const, id: "cnt_1" },
    merchant: "amazon.in",
    url: "https://amazon.in",
    title: "amazon.in",
    state: "user-drive" as const,
    handoff: { reason: "otp", ask: "Type the code they sent you" },
    actions: [],
  };
  return { ...lane, browser: { view: () => view } as unknown as BrowserService };
}

describe("what a stopped lane is waiting on", () => {
  it("reads a run that closed on a question as owed an answer", () => {
    const lane = riggedLane("A");
    lane.hub.emit({ kind: "message", text: "Looking." });
    lane.hub.emit({
      kind: "question",
      questionId: "q1",
      prompt: "Which size?",
      replies: ["M", "L"],
    });
    expect(attentionOf(lane)).toBe("question");
  });

  it("reads a run that closed on cards as owed a pick", () => {
    const lane = riggedLane("A");
    lane.hub.emit({ kind: "options", options: [] });
    expect(attentionOf(lane)).toBe("pick");
  });

  // A card taken off the table is no longer a table waiting on a person.
  it("reads a run whose cards were picked from as owed nothing", () => {
    const lane = riggedLane("A");
    lane.hub.emit({ kind: "options", options: [] });
    lane.hub.emit({ kind: "picked", ref: "w1" });
    expect(attentionOf(lane)).toBe(null);
  });

  it("reads a run that reached its outcome as owed nothing", () => {
    const lane = riggedLane("A");
    lane.hub.emit({ kind: "options", options: [] });
    lane.hub.emit({ kind: "outcome", state: "paid", txnId: "t1", detail: "" });
    expect(attentionOf(lane)).toBe(null);
  });
});

describe("what holds even while a run is still moving", () => {
  it("reads a held gate as needing the pen, even mid-run", () => {
    const lane = riggedLane("A");
    lane.chat.busy = true;
    lane.chat.awaiting = ["cart"];
    expect(attentionOf(lane)).toBe("sign");
  });

  it("reads a handed-over window as the shopper's, even mid-errand", () => {
    const lane = handedOver(riggedLane("A"));
    lane.chat.busy = true;
    expect(attentionOf(lane)).toBe("handoff");
  });

  it("says nothing about a run still working", () => {
    const lane = riggedLane("A");
    lane.chat.busy = true;
    lane.hub.emit({ kind: "question", questionId: "q", prompt: "?", replies: [] });
    expect(attentionOf(lane)).toBe(null);
  });
});

describe("the lane list", () => {
  it("reports running, queued and parked lanes in one answer", () => {
    const manager = new ChatLanes((conversation) => riggedLane(conversation), 1);
    manager.start("a kurta", "A", null);
    manager.start("a drive", "B", null);
    const rows = lanesReport(manager);
    expect(rows).toContainEqual({
      conversation: "A",
      running: true,
      queued: null,
      attention: null,
      window: false,
    });
    expect(rows).toContainEqual({
      conversation: "B",
      running: false,
      queued: 1,
      attention: null,
      window: false,
    });
    // One row per conversation: the queued row replaces the lane row.
    expect(rows.filter((row) => row.conversation === "B")).toHaveLength(1);
  });
});
