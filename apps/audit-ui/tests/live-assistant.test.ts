// @vitest-environment node
//
// The live assistant transport, driven against two real servers: ask for a
// kurta, watch the beats arrive, release both hold-to-sign gates over HTTP,
// and reach a settled outcome. Nothing here is a fixture — `COVENANT_AGENT_
// AUTOSIGN=false` means the run genuinely stops until this test signs.
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  boot,
  getJson,
  waitFor,
  type LiveHarness,
} from "./support/liveHarness.ts";
import { liveTransport } from "../src/conversation/liveTransport.ts";
import {
  applySignal,
  emptySnapshot,
  type AssistantSnapshot,
} from "../src/conversation/assistantState.ts";
import type { AssistantSignal } from "../src/conversation/assistantTransport.ts";
import { signalsForBeat } from "../src/conversation/beatSignals.ts";
import { parseChatState, type AgentBeat } from "../src/api/agentBeat.ts";

const REQUEST = "A navy kurta under 2000 rupees, refundable, please.";

let harness: LiveHarness;
let stop: () => void;
const signals: AssistantSignal[] = [];
let snapshot: AssistantSnapshot = emptySnapshot;
let beats: readonly AgentBeat[] = [];

function record(signal: AssistantSignal): void {
  signals.push(signal);
  snapshot = applySignal(snapshot, signal);
}

async function chatState(): Promise<readonly AgentBeat[]> {
  const parsed = parseChatState(await getJson(`${harness.hostUrl}/chat/state`));
  return parsed?.beats ?? [];
}

beforeAll(async () => {
  harness = await boot();
  const transport = liveTransport(harness.hostUrl, null);
  stop = transport.start(record);
  transport.send(REQUEST);

  await waitFor("the intent gate", () => snapshot.awaiting === "intent");
  expect(await transport.sign("intent")).toBe(true);

  await waitFor("the cart gate", () => snapshot.awaiting === "cart");
  expect(await transport.sign("cart")).toBe(true);

  // The outcome sentences from `beatSignals.OUTCOME_TEXT`, by the phrase that
  // makes each one distinct. Any of them means the run has settled.
  await waitFor("a settled outcome", () =>
    signals.some(
      (s) =>
        s.kind === "say" &&
        s.system === true &&
        /payment link|cool-off|signature|refused|rule you signed|did not finish/.test(
          s.text,
        ),
    ),
  );
  beats = await chatState();
}, 180_000);

afterAll(async () => {
  stop?.();
  await harness?.shutdown();
});

describe("the live beat stream", () => {
  it("reaches the UI as the conversation kinds agent-host declares", () => {
    const kinds = new Set(beats.map((beat) => beat.kind));
    for (const expected of [
      "intent-draft",
      "signing-required",
      "intent-signed",
      "message",
      "memory",
      "blocked",
      "sort-key",
      "options",
      "cart",
      "verdict",
      "outcome",
    ]) {
      expect(kinds, `beat kind ${expected}`).toContain(expected);
    }
  });

  it("maps every kind the host actually emitted onto at least one signal", () => {
    const unmapped = beats.filter(
      (beat, i) => signalsForBeat(beat, i + 1).length === 0,
    );
    expect(unmapped.map((beat) => beat.kind)).toEqual([]);
  });
});

describe("what the buyer sees", () => {
  it("echoes the buyer's own sentence before anything else", () => {
    expect(snapshot.entries[0]).toEqual({ kind: "buyer", text: REQUEST });
  });

  it("turns the run's tool work into activity pills, not into speech", () => {
    const pills = snapshot.entries
      .filter((e) => e.kind === "work")
      .flatMap((e) => (e.kind === "work" ? e.activities : []));
    // The memory pill reads as a sentence now, not "Memory rejected at P0 ·
    // R0.tier-permission · TYPE_REQUIRES_HIGHER_TIER". The codes still exist
    // where they are the point: the ledger, and the refusals sheet.
    expect(
      pills.some((p) => /remembered|not trusted/i.test(p.text)),
    ).toBe(true);
    expect(pills.some((p) => p.text.startsWith("Refused: "))).toBe(true);
    expect(pills.some((p) => p.text.startsWith("Sorted by "))).toBe(true);
    expect(pills.some((p) => p.text.startsWith("Cart built "))).toBe(true);
    expect(pills.some((p) => p.text.includes("checks passed"))).toBe(true);
  });

  it("offers the options the host published, in the host's own order", () => {
    const beat = beats.find((b) => b.kind === "options");
    const published = beat?.kind === "options" ? beat.options : [];
    expect(snapshot.options.length).toBeGreaterThan(0);
    expect(snapshot.options.map((o) => o.sku)).toEqual(
      published.map((o) => o.sku),
    );
    expect(snapshot.offering).toBe(true);
  });

  it("carries the real signed ceiling rather than the reel's ₹2,000", () => {
    const signed = beats.find((b) => b.kind === "intent-signed");
    expect(signed?.kind).toBe("intent-signed");
    expect(snapshot.covenant?.capPaise).toBe(
      signed?.kind === "intent-signed" ? signed.capPaise : -1,
    );
    expect(snapshot.covenant?.thumbprint).toMatch(/^ES256 · /);
  });
});

describe("the two signatures", () => {
  it("stopped the run at each gate and cleared it once signed", () => {
    const gates = signals.filter((s) => s.kind === "await-sign");
    expect(gates.map((g) => (g.kind === "await-sign" ? g.scope : ""))).toEqual([
      "intent",
      "cart",
    ]);
    expect(snapshot.awaiting).toBeNull();
  });

  it("settled: the host reported a terminal outcome with a txn", () => {
    const outcome = beats.find((b) => b.kind === "outcome");
    expect(outcome?.kind).toBe("outcome");
    if (outcome?.kind !== "outcome") return;
    expect(outcome.state).not.toBe("failed");
    expect(outcome.txnId).not.toBeNull();
  });
});
