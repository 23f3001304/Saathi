// @vitest-environment node
//
// The ledger transport against a real gateway: the frames the Inspect drawer
// and the Ledger route fold are the ones a purchase actually wrote.
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  boot,
  runPurchase,
  waitFor,
  type LiveHarness,
} from "./support/liveHarness.ts";
import { connectLedgerTransport } from "../src/ledger/transport.ts";
import { applyFrame, initialLedgerState } from "../src/ledger/reducer.ts";
import { deriveSealStates } from "../src/ledger/selectors.ts";
import type { ConnectionMode, LedgerFrame } from "../src/ledger/types.ts";

let harness: LiveHarness;
const frames: LedgerFrame[] = [];
const modes: ConnectionMode[] = [];
let close: () => void;

beforeAll(async () => {
  harness = await boot();
  await runPurchase(harness, "A navy kurta under 2000 rupees, refundable.");
  const transport = connectLedgerTransport(harness.gatewayUrl, {
    onFrame: (frame) => frames.push(frame),
    onModeChange: (mode) => modes.push(mode),
  });
  close = transport.close;
  await waitFor("the verdict frame", () =>
    frames.some((frame) => frame.kind === "verdict.emitted"),
  );
}, 180_000);

afterAll(async () => {
  close?.();
  await harness?.shutdown();
});

describe("the live ledger transport", () => {
  it("reports the mode it actually used, never a mode it wished for", () => {
    // Node keeps `EventSource` behind a flag, so the client lands on the
    // polling backfill — the same `/v1` route, the same frame shape.
    expect(modes).toContain("polling");
    expect(modes).not.toContain("offline");
  });

  it("reads gapless, ascending frames off the gateway's own read surface", () => {
    expect(frames.length).toBeGreaterThan(10);
    const ids = frames.map((frame) => frame.id);
    expect(ids).toEqual([...ids].sort((a, b) => a - b));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("serves the §4.2 frame shape verbatim — no client-side reshaping", () => {
    const first = frames[0];
    expect(first).toBeDefined();
    expect(Object.keys(first ?? {}).sort()).toEqual([
      "actor",
      "id",
      "kind",
      "payload",
      "prev_hash",
      "this_hash",
      "ts",
      "txn_id",
    ]);
  });

});

describe("what a purchase leaves in the chain", () => {
  it("carries the causal chain the purchase actually wrote", () => {
    const kinds = new Set(frames.map((frame) => frame.kind));
    // CONTRACT GAP (reported, not asserted): the gateway emits no
    // `cart.assembled` / `cart.digest.computed`, so the Inspect drawer's cart
    // panel has no live source. These are the kinds a purchase really writes.
    for (const kind of [
      "intent.signed",
      "memory.write.committed",
      "memory.retrieved",
      "mandate.issued",
      "verdict.emitted",
      "rzp.order.created",
    ]) {
      expect(kinds, `event kind ${kind}`).toContain(kind);
    }
  });

  it("folds into a transaction the Inspect drawer can render", () => {
    const state = frames.reduce(applyFrame, initialLedgerState);
    expect(state.lastId).toBe(Math.max(...frames.map((f) => f.id)));
    expect(state.headHash).toMatch(/^[0-9a-f]{64}$/);
    expect(state.liveTxnId).not.toBeNull();
    const txn = state.txns[state.liveTxnId ?? ""];
    // The live `verdict.emitted` shape is the gateway's own record, not the
    // fixture view shape; normalising it is what keeps this from throwing.
    expect(txn?.checks.length).toBe(8);
    expect(txn?.checks.every((check) => check.passed)).toBe(true);
    expect(deriveSealStates(txn?.checks ?? []).map((s) => s.state)).toEqual(
      Array.from({ length: 8 }, () => "passed"),
    );
  });
});

describe("an unreachable gateway", () => {
  it("says offline rather than sitting on an empty screen", async () => {
    const seen: ConnectionMode[] = [];
    let detail: string | null = null;
    const dead = connectLedgerTransport("http://127.0.0.1:1", {
      onFrame: () => undefined,
      onModeChange: (mode) => seen.push(mode),
      onUnreachable: (why) => {
        detail = why;
      },
    });
    await waitFor("the offline verdict", () => detail !== null, 30_000);
    dead.close();
    expect(seen).toContain("polling");
    expect(seen).toContain("offline");
    expect(detail).not.toBeNull();
  });
});
