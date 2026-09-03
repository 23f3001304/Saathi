// What a resumed checkout is told about the leg that parked it. `resumeReset`
// clears the filled slots so one form cannot hold the same checkout forever;
// the fill itself is a thing this host did, and the record has to keep saying
// so or it contradicts the very reason the errand is being resumed. Its own
// file because `web-address-confirm.test.ts` is at its line cap.
import { beforeEach, describe, expect, it } from "vitest";

import { BeatHub } from "../src/http/beat-hub.js";
import { WebBuyStep } from "../src/purchase/web-buy-step.js";
import { WebPickPark } from "../src/purchase/web-pick-park.js";
import { DELIVERY, RESULTS } from "./support/fake-shop.js";
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

interface Errand {
  converse: (prompt: string) => Promise<unknown>;
}

/** Fills the form the way a real errand does, through the tool, and only on
 *  the looking leg: the summary leg has nothing left to type. */
function filling(): Errand {
  let typed = false;
  return {
    converse: async (prompt: string) => {
      prompts.push(prompt);
      if (!typed) {
        typed = true;
        await web.call("web_open", { url: DELIVERY });
        await web.call("web_fill_address");
      }
      return {
        transcript: ["Going to Asha Rao in Bengaluru. Is that right?"],
        blocked: [],
        turns: 2,
        completed: true,
      };
    },
  };
}

/** The resumed errand, driving nothing: what it was handed is the claim. */
function reading(): Errand {
  return {
    converse: (prompt: string) => {
      prompts.push(prompt);
      return Promise.resolve({
        transcript: ["At payment."],
        blocked: [],
        turns: 1,
        completed: true,
      });
    },
  };
}

function stepWith(errand: Errand): WebBuyStep {
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
  prompts.length = 0;
  web = webHarness(TRAITS);
  hub = new BeatHub(new StepClock(), new RecordingLogger());
  park = new WebPickPark();
  await web.call("web_open", { url: RESULTS });
  await web.call("web_read");
});

describe("the record a resumed checkout is handed", () => {
  it("still names the form this host typed, and the wheel it has back", async () => {
    await stepWith(filling()).buy("w1", []);
    expect(park.reason).toBe("address");
    await stepWith(reading()).resume(["yes that is right"]);
    // The driving leg, not the summary: this is the prompt the resumed errand
    // picks its next tool call from, and it sits a few lines under the reason
    // it stopped, which says a delivery form was filled. A block that denied
    // the fill there would invite it to type the same form again and park the
    // same checkout a second time.
    const drive = prompts.at(-2) ?? "";
    expect(drive).toContain("- delivery form: filled (name, city)");
    expect(drive).toContain(
      "- window: still the agent's, on the page last read",
    );
  });
});
