// Tapping one of the open-web cards. The host resolves which page the ref was
// and drives the window there; the errand works the shop's own basket from
// where it lands; the payment step never moves.
import { beforeEach, describe, expect, it } from "vitest";

import { BeatHub } from "../src/http/beat-hub.js";
import { WebBuyStep } from "../src/purchase/web-buy-step.js";
import { WebPickPark } from "../src/purchase/web-pick-park.js";
import { CHECKOUT, DELIVERY, PRODUCT, RESULTS } from "./support/fake-shop.js";
import { RecordingLogger, StepClock } from "./support/fakes.js";
import { webHarness } from "./support/web-harness.js";
import type { WebHarness } from "./support/web-harness.js";

const TRAITS = [
  { key: "full_name", value: "Asha Rao" },
  { key: "city", value: "Bengaluru" },
];

let web: WebHarness;
let hub: BeatHub;
let park: WebPickPark;

function stepOn(said = "It is in the basket.", carts = false): WebBuyStep {
  return new WebBuyStep(
    hub,
    {
      converse: () => {
        // Stands in for the add-to-basket click the real errand makes; the
        // recording itself is `WebShopper`'s and is covered where the tools
        // are driven for real.
        if (carts) web.progress.recordCarted();
        return Promise.resolve({
          transcript: [said],
          blocked: [],
          turns: 1,
          completed: true,
        });
      },
    },
    web.shopper,
    web.trail,
    web.findings,
    new RecordingLogger(),
    "INR",
    web.progress,
    park,
  );
}

function said(): string[] {
  return hub
    .snapshot()
    .flatMap((beat) => (beat.kind === "message" ? [beat.text] : []));
}

/** Reads the results page, so the refs the cards carry actually exist. */
async function shown(): Promise<void> {
  await web.call("web_open", { url: RESULTS });
  await web.call("web_read");
}

beforeEach(async () => {
  web = webHarness(TRAITS);
  hub = new BeatHub(new StepClock(), new RecordingLogger());
  park = new WebPickPark();
  await shown();
});

describe("a tapped card drives the window", () => {
  it("goes to the listing the ref names, and says where it got to", async () => {
    const result = await stepOn("It is in the basket.", true).buy("w1", [
      "runners under 3000",
    ]);
    expect(web.page.url()).toBe(PRODUCT);
    expect(result.status).toBe("answered");
    expect(said()[0]).toBe("It is in the basket.");
    expect(said().at(-1)).toContain("payment step is yours");
  });

  it("admits an empty basket rather than handing over a payment step", async () => {
    // The errand claims a basket; this host watched no add-to-basket click
    // land. The closing line reports the host's own record, not the claim.
    await stepOn("It is in the basket.").buy("w1", ["runners under 3000"]);
    expect(said().at(-1)).toContain("could not get it into that shop's basket");
    expect(said().at(-1)).not.toContain("payment step is yours");
  });

  it("signs nothing and drafts nothing on the way", async () => {
    const result = await stepOn().buy("w2", []);
    expect(result.intent).toBeNull();
    expect(result.cart).toBeNull();
  });
});

/**
 * The identity rule, one layer out from `resolve-identity.ts`: the person
 * chooses which card, the host resolves which page. A ref with no page behind
 * it has no nearest match, so nothing is navigated.
 */
describe("a pick the host cannot resolve", () => {
  it("is refused rather than approximated, and says so in the thread", async () => {
    const result = await stepOn().buy("w99", []);
    expect(web.page.url()).toBe(RESULTS);
    expect(said()[0]).toContain("no longer have that listing");
    // Still a turn that answers: a silent refusal leaves the shopper looking
    // at a card they tapped and nothing happening.
    expect(result.status).toBe("answered");
  });
});

describe("the delivery form, filled from what the shopper said", () => {
  it("types only stated traits, and names what nobody told it", async () => {
    await web.call("web_open", { url: DELIVERY });
    const body = await web.body("web_fill_address");
    expect(body["filled"]).toEqual(["name", "city"]);
    expect(body["unknown"]).toEqual(["street", "postcode"]);
    expect(web.page.typed).toEqual([
      { selector: "#full-name", text: "Asha Rao" },
      { selector: "#city", text: "Bengaluru" },
    ]);
    expect(String(body["human"])).toContain("still theirs");
  });

  it("invents nothing at all when it has been told nothing", async () => {
    const bare = webHarness();
    await bare.call("web_open", { url: DELIVERY });
    const body = await bare.body("web_fill_address");
    expect(bare.page.typed).toEqual([]);
    expect(String(body["human"])).toContain("not been told an address");
  });

  it("never reaches for the card box beside them", async () => {
    await web.call("web_open", { url: DELIVERY });
    await web.call("web_fill_address");
    const aimed = web.page.typed.map((entry) => entry.selector);
    expect(aimed).not.toContain("#card-number");
  });
});

/**
 * The line that does not move, and the one that did.
 *
 * A checkout page used to refuse every text entry on it, which is what left the
 * shopper hand-filling their own address. Now the boxes this harness can name
 * as postal are filled from what they stated, and everything else on that page
 * is refused exactly as before — the card box is never even reached for.
 */
describe("a delivery box on a checkout page", () => {
  it("is filled from stated traits, while the card box beside it is not", async () => {
    await web.call("web_open", { url: CHECKOUT });
    const body = await web.body("web_fill_address");
    expect(body["ok"]).toBe(true);
    expect(body["filled"]).toEqual(["city"]);
    expect(web.page.typed).toEqual([
      { selector: "#ship-city", text: "Bengaluru" },
    ]);
    expect(web.service.current()?.currentState()).toBe("agent-drive");
  });

  it("still hands the window over on reading that page", async () => {
    await web.call("web_open", { url: CHECKOUT });
    const body = await web.body("web_read");
    expect(body["failure"]).toBe("at_payment_step");
    expect(web.service.current()?.handoff().current()?.reason).toBe("payment");
  });
});
