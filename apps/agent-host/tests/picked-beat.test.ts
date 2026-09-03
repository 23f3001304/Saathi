// Which card was chosen is a fact about the run, so the host says it out loud
// and the durable log keeps it. Said where the ref *resolves*, never on the way
// in: a tap carries a ref off a card that may be a run old.
import type { GatewayClient, TurnPlan } from "@covenant/agents";
import { beforeEach, describe, expect, it } from "vitest";

import type { WebListingView } from "../src/browser/web-listing.js";
import { BeatHub } from "../src/http/beat-hub.js";
import type { ChatBeat } from "../src/http/chat-beat.js";
import { ChatService } from "../src/http/chat-service.js";
import { ConfirmationGate } from "../src/purchase/confirmation-gate.js";
import { pickTurn } from "../src/purchase/pick-step.js";
import type { PurchaseResult } from "../src/purchase/purchase-result.js";
import { emptyResult } from "../src/purchase/purchase-result.js";
import { WebBuyStep } from "../src/purchase/web-buy-step.js";
import { WebPickPark } from "../src/purchase/web-pick-park.js";
import { PRODUCT, RESULTS } from "./support/fake-shop.js";
import { RecordingLogger, SeqIds, StepClock } from "./support/fakes.js";
import { webHarness, type WebHarness } from "./support/web-harness.js";

const REBUILT: PurchaseResult = {
  ...emptyResult("urn:covenant:pick:SKU-1", "SKU-1"),
  status: "bounded",
};

function refs(hub: BeatHub): string[] {
  return hub
    .snapshot()
    .flatMap((beat) => (beat.kind === "picked" ? [beat.ref] : []));
}

let web: WebHarness;
let hub: BeatHub;
/** What the log held when the window was handed the listing's URL, and then
 *  when the errand began driving what it found there. */
let opened: ChatBeat[][];
let drove: ChatBeat[][];

beforeEach(async () => {
  web = webHarness();
  hub = new BeatHub(new StepClock(), new RecordingLogger());
  opened = [];
  drove = [];
  // Reads the results page, so the refs the cards carry actually exist.
  await web.call("web_open", { url: RESULTS });
  await web.call("web_read");
});

function stepOn(): WebBuyStep {
  return new WebBuyStep(
    hub,
    {
      converse: () => {
        drove.push([...hub.snapshot()]);
        return Promise.resolve({
          transcript: [],
          blocked: [],
          turns: 1,
          completed: true,
        });
      },
    },
    {
      open: (url: string) => {
        opened.push([...hub.snapshot()]);
        return web.shopper.open(url);
      },
      theirs: () => false,
      view: () => web.service.view(),
    },
    web.trail,
    web.findings,
    new RecordingLogger(),
    "INR",
    web.progress,
    new WebPickPark(),
  );
}

describe("the open-web leg, where a listing is what resolves", () => {
  it("says the ref before it drives the window there", async () => {
    await stepOn().buy("w1", []);
    expect(refs(hub)).toEqual(["w1"]);
    expect(opened[0]).toMatchObject([{ kind: "picked", ref: "w1" }]);
  });

  it("says nothing for a ref that is on no listing this host read", async () => {
    await stepOn().buy("w99", []);
    expect(refs(hub)).toEqual([]);
    expect(opened).toEqual([]);
  });

  // The founder opened the Windows tab while the errand was still driving. The
  // window's beat was written only when the run settled, so he came back to a
  // pick with no window and a dock asking for a shop it was already in.
  it("says the window is open before the errand drives it", async () => {
    await stepOn().buy("w1", []);
    const seen = (drove[0] ?? []).flatMap((beat) =>
      beat.kind === "sandbox" ? [beat.session.url] : [],
    );
    expect(seen).toEqual([PRODUCT]);
  });
});

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

/** Nothing on the open-web table, so every ref takes the platform leg. */
function wordRig(rebuilt: PurchaseResult | null) {
  const own = new BeatHub(new StepClock(), new RecordingLogger());
  const parts = {
    hub: own,
    offered: { current: (): readonly WebListingView[] => [] },
    webPick: { buy: () => Promise.reject(new Error("not this leg")) },
    repropose: () => Promise.resolve(rebuilt),
    ids: new SeqIds(),
    logger: new RecordingLogger(),
  };
  return { hub: own, parts };
}

describe("the model naming a platform card in words", () => {
  it("says the ref once the cart has been rebuilt for it", async () => {
    const rig = wordRig(REBUILT);
    const said = emptyResult("r1", "the navy one");
    await pickTurn(rig.parts, said, planOf("SKU-1"), [], null);
    expect(refs(rig.hub)).toEqual(["SKU-1"]);
  });

  it("says nothing for a ref that rebuilt nothing", async () => {
    const rig = wordRig(null);
    const said = emptyResult("r2", "the sandisk");
    await pickTurn(rig.parts, said, planOf("SKU-9"), [], null);
    expect(refs(rig.hub)).toEqual([]);
  });
});

function tapRig(rebuilt: PurchaseResult | null) {
  const logger = new RecordingLogger();
  const own = new BeatHub(new StepClock(), logger);
  /** What the log held when each leg was handed the ref. */
  const handed: ChatBeat[][] = [];
  const watch = (): void => void handed.push([...own.snapshot()]);
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
    own,
    new ConfirmationGate(false),
    new ConfirmationGate(false),
    null as unknown as GatewayClient,
    new StepClock(),
    logger,
    { userId: "usr_rig", tenantId: "tnt_rig" },
    { claim: () => undefined, open: () => undefined, sandbox: () => null },
    webPick,
  );
  return { hub: own, service, handed };
}

describe("a tapped card", () => {
  it("waits for the rebuilt cart before it says which sku", async () => {
    const rig = tapRig(REBUILT);
    rig.service.pick("SKU-1");
    await rig.service.settled();
    // Nothing had been claimed yet when the rebuild was asked for.
    expect(rig.handed[0]).toEqual([]);
    expect(refs(rig.hub)).toEqual(["SKU-1"]);
  });

  it("leaves a stale ref unannounced, for the leg that resolves it", async () => {
    const rig = tapRig(null);
    rig.service.pick("w1");
    await rig.service.settled();
    expect(rig.handed[1]).toEqual([]);
    expect(refs(rig.hub)).toEqual([]);
  });
});
