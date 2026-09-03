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

const prompts: string[] = [];

function stepOn(said = "It is in the basket.", carts = false): WebBuyStep {
  return new WebBuyStep(
    hub,
    {
      converse: (prompt: string) => {
        prompts.push(prompt);
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
    {
      open: (url: string) => web.shopper.open(url),
      // Whose turn it is at the window, read off the real state machine the
      // way `web-wiring.ts` reads it: the step asks this of every errand.
      theirs: () => web.service.current()?.currentState() === "user-drive",
      view: () => web.service.view(),
    },
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
  prompts.length = 0;
  web = webHarness(TRAITS);
  hub = new BeatHub(new StepClock(), new RecordingLogger());
  park = new WebPickPark();
  await shown();
});

describe("a tapped card drives the window", () => {
  it("goes to the listing the ref names, and says only what the errand said", async () => {
    const result = await stepOn("It is in the basket.", true).buy("w1", [
      "runners under 3000",
    ]);
    expect(web.page.url()).toBe(PRODUCT);
    expect(result.status).toBe("answered");
    expect(said()).toEqual(["It is in the basket."]);
  });

  it("adds no line of its own over an empty basket either", async () => {
    // The errand claims a basket; this host watched no add-to-basket click
    // land. That fact went to the model before it spoke (see "the errand is
    // told what this host watched"); the harness does not append a correction.
    await stepOn("Nothing went in; the button would not take.").buy("w1", [
      "runners under 3000",
    ]);
    expect(said()).toEqual(["Nothing went in; the button would not take."]);
    expect(
      hub.snapshot().some((beat) => beat.kind === "message" && beat.variant === "system"),
    ).toBe(false);
  });

  it("signs nothing and drafts nothing on the way", async () => {
    const result = await stepOn().buy("w2", []);
    expect(result.intent).toBeNull();
    expect(result.cart).toBeNull();
  });
});

/**
 * The identity rule, one layer out from the SKU lookup: the person chooses
 * which card, the host resolves which page. A ref with no page behind it has
 * no nearest match, so nothing is navigated and nothing is said in anybody's
 * voice: the turn closes on its outcome beat alone.
 */
describe("a pick the host cannot resolve", () => {
  it("is refused rather than approximated, silently, and still closes the turn", async () => {
    const result = await stepOn().buy("w99", []);
    expect(web.page.url()).toBe(RESULTS);
    expect(said()).toEqual([]);
    expect(prompts).toEqual([]);
    const closing = hub.snapshot().find((beat) => beat.kind === "outcome");
    expect(closing).toMatchObject({ state: "answered", detail: "web_pick_unknown" });
    expect(result.status).toBe("answered");
  });
});

describe("the errand is told what this host watched", () => {
  it("names the basket as empty when no add-to-basket click landed", async () => {
    await stepOn("It is in the basket.").buy("w1", ["runners under 3000"]);
    // The second leg is the one the sentence is written from.
    expect(prompts[1]).toContain("- basket: nothing was put in a basket");
    expect(prompts[1]).toContain("- pages opened: 1 (shop.example)");
  });

  it("names the basket as holding the listing when the click landed", async () => {
    await stepOn("It is in the basket.", true).buy("w1", ["runners under 3000"]);
    expect(prompts[1]).toContain(
      '- basket: the shop\'s basket holds "Red Runners"',
    );
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
