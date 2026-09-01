// The lane cap and the line behind it. A machine holds a few concurrent runs;
// what it owes the (cap+1)th conversation is a place in line said out loud,
// not a refusal and not a silent merge into somebody else's timeline.
import { describe, expect, it } from "vitest";

import { ChatLanes } from "../src/http/chat-lanes.js";
import { riggedLane, type RiggedLane } from "./support/lane-rig.js";

function rig(cap: number) {
  const lanes = new Map<string, RiggedLane>();
  const manager = new ChatLanes((conversation) => {
    const lane = riggedLane(conversation);
    lanes.set(conversation ?? "", lane);
    return lane;
  }, cap);
  return { manager, lane: (chat: string) => lanes.get(chat) as RiggedLane };
}

/** The settle callback rides a promise; one tick lets the line move. */
async function tick(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("the lane cap", () => {
  it("runs distinct conversations concurrently up to the cap", () => {
    const { manager } = rig(2);
    expect(manager.start("a kurta", "A", null).kind).toBe("started");
    expect(manager.start("a shoe", "B", null).kind).toBe("started");
    expect(manager.running).toBe(2);
  });

  it("queues the (cap+1)th conversation and says where it stands", () => {
    const { manager } = rig(2);
    manager.start("a kurta", "A", null);
    manager.start("a shoe", "B", null);
    const third = manager.start("a stole", "C", null);
    expect(third).toMatchObject({ kind: "queued", position: 1 });
    if (third.kind === "queued") {
      expect(third.human).toContain("number 1 in line");
      expect(third.human).toContain("waiting rather than failing");
    }
    expect(manager.queued()).toEqual(["C"]);
  });

  it("lets a busy lane take its own next sentence past the cap", () => {
    const { manager, lane } = rig(2);
    manager.start("a kurta", "A", null);
    manager.start("a shoe", "B", null);
    // The answer to the run's own question must not wait behind strangers.
    expect(manager.start("size M", "A", null).kind).toBe("started");
    expect(lane("A").chat.started).toEqual(["a kurta", "size M"]);
    expect(manager.queued()).toEqual([]);
  });
});

describe("the line moves when a run settles", () => {
  it("starts the head of the line, in the order people asked", async () => {
    const { manager, lane } = rig(2);
    manager.start("a kurta", "A", null);
    manager.start("a shoe", "B", null);
    manager.start("a stole", "C", null);
    manager.start("a lamp", "D", null);
    lane("A").chat.finish();
    await tick();
    expect(lane("C").chat.started).toEqual(["a stole"]);
    expect(manager.queued()).toEqual(["D"]);
    lane("B").chat.finish();
    await tick();
    expect(lane("D").chat.started).toEqual(["a lamp"]);
    expect(manager.queued()).toEqual([]);
  });

  it("keeps a queued conversation's own sentences in order", async () => {
    const { manager, lane } = rig(1);
    manager.start("a kurta", "A", null);
    manager.start("a stole", "C", null);
    // A second sentence for a chat already in line files behind its first,
    // never past it, even though C's lane is idle.
    const second = manager.start("in blue", "C", null);
    expect(second).toMatchObject({ kind: "queued", position: 2 });
    lane("A").chat.finish();
    await tick();
    expect(lane("C").chat.started).toEqual(["a stole", "in blue"]);
  });

  it("routes a tapped card through the same line", () => {
    const { manager, lane } = rig(1);
    manager.start("a kurta", "A", null);
    const outcome = manager.pick("w3", "B");
    expect(outcome.kind).toBe("queued");
    expect(lane("B").chat.picked).toEqual([]);
  });
});

describe("a deleted chat", () => {
  it("gives up its place in line and closes its lane", async () => {
    const { manager, lane } = rig(1);
    manager.start("a kurta", "A", null);
    manager.start("a stole", "C", null);
    expect(await manager.cancel("C")).toBe(true);
    expect(manager.queued()).toEqual([]);
    expect(lane("C").closed()).toBe(true);
    // The freed slot is not stolen by the cancelled entry.
    lane("A").chat.finish();
    await tick();
    expect(lane("C").chat.started).toEqual([]);
  });

  it("answers false for a conversation this host never held", async () => {
    const { manager } = rig(1);
    expect(await manager.cancel("cnv_stranger")).toBe(false);
    expect(manager.running).toBe(0);
  });
});

describe("held lanes are bounded", () => {
  it("lets an idle lane go past the ceiling, never a busy or default one", () => {
    const { manager, lane } = rig(2);
    manager.start("a kurta", "A", null);
    // A caller naming forty conversations must not grow the host forever.
    for (let at = 0; at < 40; at += 1) manager.laneFor(`cnv_idle_${at}`);
    expect(manager.all().length).toBeLessThanOrEqual(33);
    expect(lane("A").closed()).toBe(false);
    expect(manager.laneFor("A")).toBe(lane("A"));
    expect(manager.all().some((held) => held.conversation === null)).toBe(true);
  });
});
