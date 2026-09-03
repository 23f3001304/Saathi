// The address question, and the two turns it takes: the agent fills what it
// knows and stops; the shopper answers; the agent carries on to the payment
// step. Split from `web-pick.test.ts` because it is a different claim — that
// one is about resolving a pick, this one about not acting on an address
// nobody agreed to.
import { beforeEach, describe, expect, it } from "vitest";

import { BeatHub } from "../src/http/beat-hub.js";
import { WebBuyStep } from "../src/purchase/web-buy-step.js";
import { WebPickPark } from "../src/purchase/web-pick-park.js";
import { CHECKOUT, DELIVERY, RESULTS, SIGNIN } from "./support/fake-shop.js";
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

/** Everything the shopper is shown, whichever beat carried it: an ask goes out
 *  as a `question` — that is what puts it at the composer — and a statement as
 *  a `message`. */
function said(): string[] {
  return hub.snapshot().flatMap((beat) => {
    if (beat.kind === "message") return [beat.text];
    return beat.kind === "question" ? [beat.prompt] : [];
  });
}

function asked(): string[] {
  return hub
    .snapshot()
    .flatMap((beat) => (beat.kind === "question" ? [beat.prompt] : []));
}

/** An errand that fills the form the way a real one does: through the tool. */
function filling(text: string) {
  return {
    converse: async () => {
      await web.call("web_open", { url: DELIVERY });
      await web.call("web_fill_address");
      return { transcript: [text], blocked: [], turns: 2, completed: true };
    },
  };
}

/** An errand that walks on to the page which asks for a card. */
function onward() {
  return {
    converse: async () => {
      await web.call("web_open", { url: CHECKOUT });
      await web.call("web_read");
      return {
        transcript: ["At payment."],
        blocked: [],
        turns: 2,
        completed: true,
      };
    },
  };
}

function stepWith(errand: {
  converse: (prompt: string) => Promise<unknown>;
}): WebBuyStep {
  return new WebBuyStep(
    hub,
    errand as never,
    {
      open: (url: string) => web.shopper.open(url),
      theirs: () => web.service.current()?.currentState() === "user-drive",
    },
    web.trail,
    web.findings,
    new RecordingLogger(),
    "INR",
    web.progress,
    park,
  );
}

beforeEach(async () => {
  web = webHarness(TRAITS);
  hub = new BeatHub(new StepClock(), new RecordingLogger());
  park = new WebPickPark();
  await web.call("web_open", { url: RESULTS });
  await web.call("web_read");
});

describe("the address is confirmed before the checkout goes on", () => {
  it("asks one question, and parks rather than pressing on", async () => {
    const result = await stepWith(filling("Filled what I had.")).buy("w1", []);
    expect(park.parked).toBe(true);
    expect(park.held).toBe("w1");
    // At the composer, not buried in the transcript: a parked checkout is
    // owed an answer, so the ask is the beat that arms the dock.
    expect(asked()).toHaveLength(1);
    expect(asked()[0]).toContain("Is it correct?");
    expect(result.status).toBe("answered");
  });

  /** The park is what keeps the window alive across the turn boundary: the
   *  basket and the filled form are still there when they answer. */
  it("holds the window open while the question is outstanding", async () => {
    await stepWith(filling("Filled.")).buy("w1", []);
    expect(web.service.isOpen).toBe(true);
    expect(web.page.typed.map((entry) => entry.selector)).toContain("#city");
  });

  it("carries on from their answer, in the same window, to the payment step", async () => {
    const step = stepWith(filling("Filled."));
    await step.buy("w1", []);
    const resumed = await stepWith(onward()).resume(["yes that is right"]);
    expect(resumed.status).toBe("answered");
    // The question is answered, so nothing is parked and the window is theirs.
    expect(park.parked).toBe(false);
    expect(web.service.current()?.handoff().current()?.reason).toBe("payment");
    expect(said().at(-1)).toContain("payment step is yours");
  });

  it("asks again rather than proceeding when the form is refilled", async () => {
    await stepWith(filling("Filled.")).buy("w1", []);
    await stepWith(filling("Filled it again.")).resume(["no, my office one"]);
    expect(park.parked).toBe(true);
  });
});

/**
 * "Carry on" is not the same as having signed in. A resume while the wheel is
 * still theirs keeps the park rather than spending an errand being refused at
 * every tool: the model is told what the parked leg actually observed and says
 * so in its own words, and the basket survives a sentence that was early.
 */
describe("a resume that arrives before the shopper is through", () => {
  it("keeps the park, tells the model whose the window is, and says only what the model said", async () => {
    const prompts: string[] = [];
    const wall = {
      converse: async (prompt: string) => {
        prompts.push(prompt);
        if (prompts.length <= 2) {
          await web.call("web_open", { url: SIGNIN });
          await web.call("web_read");
        }
        return {
          transcript: ["The shop is still waiting on you at the sign-in."],
          blocked: [],
          turns: 1,
          completed: true,
        };
      },
    };
    await stepWith(wall).buy("w1", []);
    expect(park.parked).toBe(true);
    expect(park.reason).toBe("handback");

    const early = await stepWith(wall).resume(["ok carry on"]);
    expect(park.parked).toBe(true);
    // The parked leg's own record, not a default: it names the reason the
    // wheel went over, which is the thing a guessed block cannot know.
    expect(prompts.at(-1)).toContain("- window: handed to them because login");
    expect(said().at(-1)).toBe("The shop is still waiting on you at the sign-in.");
    expect(early.status).toBe("answered");
  });
});
