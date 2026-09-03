// A tapped listing whose page will not open. Split from `web-pick.test.ts`
// because it is a different claim: that the one fact this host holds alone -
// the window never landed - still reaches the shopper as the model's own
// sentence, on a conversation nobody left half-finished.
import { beforeEach, describe, expect, it } from "vitest";

import type { WebResult } from "../src/browser/web-result.js";
import { BeatHub } from "../src/http/beat-hub.js";
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

/** A window that never lands, on a conversation that records what it was
 *  asked and when it was abandoned. */
function shutStep(): WebBuyStep {
  return new WebBuyStep(
    hub,
    {
      converse: (prompt: string) => {
        prompts.push(prompt);
        order.push("say");
        return Promise.resolve({
          transcript: ["I could not reach that page at all."],
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
    { open: () => Promise.resolve(SHUT), theirs: () => false },
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
    const result = await shutStep().buy("w1", ["runners under 3000"]);
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
    await shutStep().buy("w1", []);
    expect(order).toEqual(["reset", "say"]);
  });
});
