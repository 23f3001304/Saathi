// The two facts about a tapped card that only this host holds: the window
// never landed, and the window is not ours. Split from `web-pick.test.ts`
// because it is a different claim - that neither reaches the shopper as a
// sentence the harness wrote, and that the record, not the errand, is what
// the model is told.
import { beforeEach, describe, expect, it } from "vitest";

import type { WebResult } from "../src/browser/web-result.js";
import { BeatHub } from "../src/http/beat-hub.js";
import type { SandboxOpener } from "../src/purchase/web-buy-step.js";
import { WebBuyStep } from "../src/purchase/web-buy-step.js";
import { WebPickPark } from "../src/purchase/web-pick-park.js";
import { RESULTS } from "./support/fake-shop.js";
import { RecordingLogger, StepClock } from "./support/fakes.js";
import { webHarness } from "./support/web-harness.js";
import type { WebHarness } from "./support/web-harness.js";

const SHUT: WebResult = { isError: true, body: { ok: false } };

let web: WebHarness;
let hub: BeatHub;
let park: WebPickPark;
const prompts: string[] = [];
const order: string[] = [];

/** The step on whatever window it is handed, driven by a conversation that
 *  records what it was asked and when it was abandoned. */
function stepOn(sandbox: SandboxOpener, says: string): WebBuyStep {
  return new WebBuyStep(
    hub,
    {
      converse: (prompt: string) => {
        prompts.push(prompt);
        order.push("say");
        return Promise.resolve({
          transcript: [says],
          blocked: [],
          turns: 1,
          completed: true,
        });
      },
      reset: () => {
        order.push("reset");
        return Promise.resolve();
      },
    },
    sandbox,
    web.trail,
    web.findings,
    new RecordingLogger(),
    "INR",
    web.progress,
    park,
  );
}

/** A window that never lands. */
function shut(): SandboxOpener {
  return {
    open: () => Promise.resolve(SHUT),
    theirs: () => false,
    view: () => null,
  };
}

/** A window that opens and is theirs from the first tool on. */
function handed(): SandboxOpener {
  return {
    open: (url: string) => web.shopper.open(url),
    theirs: () => true,
    view: () => web.service.view(),
  };
}

function said(): string[] {
  return hub
    .snapshot()
    .flatMap((beat) => (beat.kind === "message" ? [beat.text] : []));
}

beforeEach(async () => {
  prompts.length = 0;
  order.length = 0;
  web = webHarness();
  hub = new BeatHub(new StepClock(), new RecordingLogger());
  park = new WebPickPark();
  await web.call("web_open", { url: RESULTS });
  await web.call("web_read");
});

describe("a listing whose page will not open", () => {
  it("closes on the model's own sentence rather than a fixed one", async () => {
    const step = stepOn(shut(), "I could not reach that page at all.");
    const result = await step.buy("w1", ["runners under 3000"]);
    // One leg only: there was nothing to look at, so there is nothing to
    // summarise beyond the fact the host holds.
    expect(prompts).toHaveLength(1);
    expect(prompts[0]).toContain("- pages opened: none");
    expect(said()).toEqual(["I could not reach that page at all."]);
    expect(said().join(" ")).not.toContain("could not get that listing open");
    expect(result.status).toBe("answered");
  });

  /**
   * `sayOnly` does not reset, and this leg has no `runErrand` in front of it
   * to do it for them: without the reset here the one sentence a shopper reads
   * would be appended to a previous errand's unawaited half.
   */
  it("abandons whatever the conversation was doing before asking", async () => {
    await stepOn(shut(), "Nothing opened.").buy("w1", []);
    expect(order).toEqual(["reset", "say"]);
  });
});

/**
 * Whose the window is is the host's own reading of the state machine, not the
 * errand's claim, and it reaches the model through `pickFacts` like every
 * other observation - so a wheel that went over is named on the summary leg.
 */
describe("a window that is theirs while the errand runs", () => {
  it("tells the model the shopper has the wheel", async () => {
    await stepOn(handed(), "It is yours now.").buy("w1", ["runners"]);
    expect(prompts[1]).toContain(
      "- window: the shopper has the wheel; the shop is waiting on them",
    );
  });
});
