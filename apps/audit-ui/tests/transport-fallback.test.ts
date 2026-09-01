// @vitest-environment node
//
// Honest degradation. Nothing is booted here on purpose: the point is what
// the UI does when the host it was configured to talk to is not there.
import { describe, expect, it } from "vitest";

import { waitFor } from "./support/liveHarness.ts";
import { liveTransport } from "../src/conversation/liveTransport.ts";
import { resilientTransport } from "../src/conversation/resilientTransport.ts";
import { scriptTransport } from "../src/conversation/scriptTransport.ts";
import {
  applySignal,
  emptySnapshot,
  type AssistantSnapshot,
} from "../src/conversation/assistantState.ts";
import type { AssistantSignal } from "../src/conversation/assistantTransport.ts";

/** Refuses instantly on every platform; nothing listens on port 1. */
const DEAD = "http://127.0.0.1:1";

function collector(): {
  record: (s: AssistantSignal) => void;
  signals: AssistantSignal[];
  snapshot: () => AssistantSnapshot;
} {
  const signals: AssistantSignal[] = [];
  let snapshot = emptySnapshot;
  return {
    signals,
    snapshot: () => snapshot,
    record: (signal) => {
      signals.push(signal);
      snapshot = applySignal(snapshot, signal);
    },
  };
}

describe("an unreachable agent host", () => {
  it("declares itself offline instead of pretending to think", async () => {
    const seen = collector();
    const stop = liveTransport(DEAD, null).start(seen.record);
    await waitFor(
      "the offline verdict",
      () => seen.snapshot().status === "offline",
      30_000,
    );
    stop();
    expect(seen.snapshot().status).toBe("offline");
    expect(seen.snapshot().notice).not.toBeNull();
    // It must not have invented a transcript on the way down.
    expect(seen.snapshot().entries).toEqual([]);
  });

  it("stands the reel up behind the offline banner, still labelled offline", async () => {
    const seen = collector();
    const transport = resilientTransport(liveTransport(DEAD, null), () =>
      scriptTransport(),
    );
    const stop = transport.start(seen.record);
    await waitFor(
      "the reel's first question",
      () => seen.snapshot().question !== null,
      30_000,
    );
    stop();
    // The reel is running…
    expect(seen.snapshot().question?.prompt).toBe("What are you shopping for?");
    // …and the screen still says the frames are not a run.
    expect(seen.snapshot().status).toBe("offline");
    expect(
      seen.signals.filter(
        (s) => s.kind === "status" && s.status === "fixtures",
      ),
    ).toEqual([]);
  });
});

describe("the fixture transport", () => {
  it("signs locally, because nothing crosses a wire", async () => {
    const transport = scriptTransport();
    const stop = transport.start(() => undefined);
    expect(await transport.sign("cart")).toBe(true);
    stop();
  });

  it("walks the script one buyer turn at a time", async () => {
    const seen = collector();
    const transport = scriptTransport();
    const stop = transport.start(seen.record);
    expect(seen.snapshot().question?.id).toBe("what");
    // An ask is one utterance: it stands in the transcript and it arms the
    // composer, so the opening question is already an entry when they answer.
    transport.send("A navy kurta");
    expect(seen.snapshot().entries.at(-1)).toEqual({
      kind: "buyer",
      text: "A navy kurta",
    });
    await waitFor(
      "the ceiling question",
      () => seen.snapshot().question?.id === "cap",
      10_000,
    );
    stop();
  });
});
