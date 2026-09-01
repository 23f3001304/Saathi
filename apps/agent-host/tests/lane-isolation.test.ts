// The property the whole lane layer exists for: two conversations running at
// once, and no object either run writes reaches the other. Streams stay
// disjoint, epochs never collide, and one chat's pen releases only its own
// gate. This codebase has been burned by every one of these before.
import { describe, expect, it } from "vitest";

import type { BeatSink } from "../src/http/beat-hub.js";
import { ChatLanes } from "../src/http/chat-lanes.js";
import { SharedEpochs } from "../src/http/epoch-source.js";
import { emptyResult } from "../src/purchase/purchase-result.js";
import { realChatLane, riggedLane } from "./support/lane-rig.js";

function recordingSink(): BeatSink & { texts: string[]; epochs: number[] } {
  const texts: string[] = [];
  const epochs: number[] = [];
  return {
    texts,
    epochs,
    deliver: (epoch, _index, beat) => {
      epochs.push(epoch);
      if (beat.kind === "message") texts.push(beat.text);
    },
    rebase: () => undefined,
    close: () => undefined,
  };
}

const CURSOR = { after: 0, epoch: null, transport: "sse" as const };

describe("two lanes with interleaved runs", () => {
  it("never deliver one conversation's beats on the other's stream", () => {
    const epochs = new SharedEpochs(0);
    const manager = new ChatLanes(
      (conversation) => riggedLane(conversation, epochs),
      2,
    );
    const a = manager.laneFor("A");
    const b = manager.laneFor("B");
    const seenA = recordingSink();
    const seenB = recordingSink();
    a.hub.subscribe(seenA, CURSOR);
    b.hub.subscribe(seenB, CURSOR);
    // Interleaved exactly as two concurrent runs would publish them.
    a.hub.emit({ kind: "message", text: "A: two kurtas fit" });
    b.hub.emit({ kind: "message", text: "B: three drives fit" });
    a.hub.emit({ kind: "message", text: "A: your bill is ready" });
    b.hub.emit({ kind: "message", text: "B: pick one" });
    expect(seenA.texts).toEqual(["A: two kurtas fit", "A: your bill is ready"]);
    expect(seenB.texts).toEqual(["B: three drives fit", "B: pick one"]);
  });

  it("never mint the same (epoch, index) address twice across lanes", () => {
    const epochs = new SharedEpochs(4);
    const a = riggedLane("A", epochs);
    const b = riggedLane("B", epochs);
    const minted: number[] = [a.hub.epoch, b.hub.epoch];
    // Each run restarts its own lane's hub; a shared counter is what keeps
    // the addresses distinct however the restarts interleave.
    a.hub.restart();
    minted.push(a.hub.epoch);
    b.hub.restart();
    minted.push(b.hub.epoch);
    a.hub.restart();
    minted.push(a.hub.epoch);
    expect(new Set(minted).size).toBe(minted.length);
    expect(Math.min(...minted)).toBeGreaterThan(4);
  });
});

describe("gates are per lane", () => {
  it("one chat's signature releases only its own run", async () => {
    const held: string[] = [];
    const laneOf = (name: string) => {
      const lane = realChatLane(name, {
        run: async (request) => {
          held.push(name);
          // The run parks on its own lane's gate, as `IntentFlow` does.
          await lane.intentGate.wait();
          return emptyResult(`urn:covenant:run:${name}`, request);
        },
      });
      return lane;
    };
    const built = new Map([
      ["A", laneOf("A")],
      ["B", laneOf("B")],
    ]);
    const lanes = new ChatLanes(
      (conversation) => built.get(conversation ?? "") ?? riggedLane(null),
      2,
    );
    lanes.start("a kurta", "A", null);
    lanes.start("a drive", "B", null);
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(held).toEqual(["A", "B"]);
    // The pen, addressed to A: only A's run may move.
    expect(lanes.laneFor("A").chat.signIntent()).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(lanes.laneFor("A").chat.busy).toBe(false);
    expect(lanes.laneFor("B").chat.busy).toBe(true);
    expect(lanes.laneFor("B").chat.state().awaiting).toContain("intent");
    // And B's own signature is what ends B.
    lanes.laneFor("B").chat.signIntent();
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(lanes.laneFor("B").chat.busy).toBe(false);
  });
});
