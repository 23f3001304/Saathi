// Which card was chosen is a fact about the run, so the host says it out loud
// and the durable log keeps it. The Bench used to hold the pick in React state
// alone: a walk to the Windows tab unmounted the chat, the `options` beat came
// back from the log and nothing said one of those cards had already been taken,
// so the composer offered the opening menu over a running errand.
import type { GatewayClient } from "@covenant/agents";
import type { TurnPlan } from "@covenant/agents";
import { describe, expect, it } from "vitest";

import type { WebListingView } from "../src/browser/web-listing.js";
import { BeatHub } from "../src/http/beat-hub.js";
import type { ChatBeat } from "../src/http/chat-beat.js";
import { ChatService } from "../src/http/chat-service.js";
import { ConfirmationGate } from "../src/purchase/confirmation-gate.js";
import { pickTurn } from "../src/purchase/pick-step.js";
import type { PurchaseResult } from "../src/purchase/purchase-result.js";
import { emptyResult } from "../src/purchase/purchase-result.js";
import { RecordingLogger, SeqIds, StepClock } from "./support/fakes.js";

const CARD: WebListingView = {
  ref: "w1",
  title: "Crucial E100 1TB",
  price_text: "₹6,199",
  price_paise: 619_900,
  url: "https://www.amazon.in/dp/B0D1XYZ123",
  image_url: null,
};

const REBUILT: PurchaseResult = {
  ...emptyResult("urn:covenant:pick:SKU-1", "SKU-1"),
  status: "bounded",
};

function planOf(ref: string): TurnPlan {
  return {
    action: "pick",
    reply: "Going with that one.",
    question: null,
    query: null,
    amendment: null,
    traits: [],
    ref,
  };
}

function refs(hub: BeatHub): string[] {
  return hub
    .snapshot()
    .flatMap((beat) => (beat.kind === "picked" ? [beat.ref] : []));
}

function wordRig(
  offered: readonly WebListingView[],
  rebuilt: PurchaseResult | null = null,
) {
  const hub = new BeatHub(new StepClock(), new RecordingLogger());
  /** What the log held at the moment the errand was handed the ref. */
  const before: ChatBeat[][] = [];
  const watch = (): void => void before.push([...hub.snapshot()]);
  const parts = {
    hub,
    offered: { current: () => offered },
    webPick: {
      buy: (ref: string): Promise<PurchaseResult> => {
        watch();
        return Promise.resolve({ ...emptyResult("pick", ref), status: "answered" as const });
      },
    },
    repropose: (): Promise<PurchaseResult | null> => {
      watch();
      return Promise.resolve(rebuilt);
    },
    ids: new SeqIds(),
    logger: new RecordingLogger(),
  };
  return { hub, parts, before };
}

describe("the model naming a card in words", () => {
  it("says the ref before the open-web errand is handed it", async () => {
    const { hub, parts, before } = wordRig([CARD]);
    await pickTurn(parts, emptyResult("r1", "the crucial"), planOf("w1"), [], null);
    expect(refs(hub)).toEqual(["w1"]);
    expect(before[0]).toMatchObject([{ kind: "picked", ref: "w1" }]);
  });

  it("says a platform sku the same way once the cart is rebuilt", async () => {
    const { hub, parts } = wordRig([], REBUILT);
    await pickTurn(parts, emptyResult("r2", "the navy one"), planOf("SKU-1"), [], null);
    expect(refs(hub)).toEqual(["SKU-1"]);
  });

  it("says nothing at all for a ref that is on no card", async () => {
    const { hub, parts } = wordRig([CARD]);
    await pickTurn(parts, emptyResult("r3", "the sandisk"), planOf("w9"), [], null);
    expect(refs(hub)).toEqual([]);
  });
});

function tapRig(rebuilt: PurchaseResult | null) {
  const logger = new RecordingLogger();
  const hub = new BeatHub(new StepClock(), logger);
  const before: ChatBeat[][] = [];
  const watch = (): void => void before.push([...hub.snapshot()]);
  const runner = {
    run: () => Promise.resolve(emptyResult("r", "")),
    repropose: (): Promise<PurchaseResult | null> => {
      watch();
      return Promise.resolve(rebuilt);
    },
  };
  const webPick = {
    buy: (ref: string): Promise<PurchaseResult> => {
      watch();
      return Promise.resolve(emptyResult("buy", ref));
    },
    resume: () => Promise.resolve(emptyResult("resume", "")),
    parked: false,
  };
  const service = new ChatService(
    runner,
    hub,
    new ConfirmationGate(false),
    new ConfirmationGate(false),
    null as unknown as GatewayClient,
    new StepClock(),
    logger,
    { userId: "usr_rig", tenantId: "tnt_rig" },
    { claim: () => undefined, open: () => undefined, sandbox: () => null },
    webPick,
  );
  return { hub, service, before };
}

describe("a tapped card", () => {
  it("is written down before the open-web errand is handed the ref", async () => {
    const { hub, service, before } = tapRig(null);
    service.pick("w1");
    await service.settled();
    expect(refs(hub)).toEqual(["w1"]);
    expect(before[0]).toMatchObject([{ kind: "picked", ref: "w1" }]);
  });

  it("is written down for a platform card the tap rebuilds a cart for", async () => {
    const { hub, service, before } = tapRig(REBUILT);
    service.pick("SKU-1");
    await service.settled();
    expect(refs(hub)).toEqual(["SKU-1"]);
    expect(before[0]).toMatchObject([{ kind: "picked", ref: "SKU-1" }]);
  });
});
