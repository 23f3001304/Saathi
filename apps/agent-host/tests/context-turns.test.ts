// The working context on a live turn: the shell files it after every run, the
// next turn's planner reads it as data, and a follow-up errand starts at the
// URL this conversation already found instead of on a storefront's front page.
import type { TurnPlan, TurnPlanner } from "@covenant/agents";
import { describe, expect, it } from "vitest";

import { WebFindings } from "../src/browser/web-listing.js";
import { WebTrail } from "../src/browser/web-trail.js";
import { BeatHub } from "../src/http/beat-hub.js";
import type { PurchaseResult } from "../src/purchase/purchase-result.js";
import { emptyResult } from "../src/purchase/purchase-result.js";
import { PurchaseRunner } from "../src/purchase/purchase-runner.js";
import { resumeErrandFor } from "../src/purchase/web-buy-errand.js";
import type { WebErrand } from "../src/purchase/web-look-step.js";
import { WebLookStep } from "../src/purchase/web-look-step.js";
import type { WorkingContext } from "../src/purchase/working-context.js";
import { RecordingLogger, SilentLogger, StepClock } from "./support/fakes.js";
import { mapLog, recorderRig, RUN_CONFIG, stillParts } from "./support/context-rig.js";

const CHAT = "cnv_turn_a";

const URL = "https://www.amazon.in/CRUCIAL-E100/dp/B0D1XYZ123";

const TILE = {
  title: "Crucial E100 1TB Portable SSD",
  priceText: "₹6,199",
  href: URL,
  imageUrl: null,
};

const OTHER = { ...TILE, title: "SANDISK Extreme 1TB SSD", href: `${URL}9` };

const KNOWN: WorkingContext = {
  v: 1,
  asked: "1tb ssd",
  options: [
    {
      ref: "w1",
      title: "Crucial E100 1TB Portable SSD",
      priceText: "₹6,199",
      url: URL,
      productKey: "B0D1XYZ123",
      imageUrl: null,
    },
  ],
  pick: null,
  progress: null,
  outcome: null,
  summary: null,
  folded: null,
};

function look(): TurnPlan {
  return {
    action: "look_on_web",
    reply: "",
    question: null,
    query: "1tb ssd",
    amendment: null,
    traits: [],
  };
}

/** The runner over a real recorder; the look offers real cards. */
function turnRig() {
  const tables = recorderRig(mapLog());
  const contexts: string[] = [];
  const planner: TurnPlanner = {
    plan: async (_lines, _lang, _note, context = "") => {
      contexts.push(context);
      return look();
    },
  };
  const webLook = {
    look: async (base: PurchaseResult): Promise<PurchaseResult> => {
      tables.offered.offer(tables.findings.record([TILE, OTHER]));
      return { ...base, status: "answered", transcript: ["Found drives."] };
    },
  };
  const parts = {
    ...stillParts(),
    planner,
    webLook,
    offered: tables.offered,
    context: tables.recorder,
  };
  const runner = new PurchaseRunner(parts as never, RUN_CONFIG);
  return { runner, recorder: tables.recorder, contexts };
}

describe("the shell files the working context after a run", () => {
  it("writes options and constraints once the research run ends", async () => {
    const { runner, recorder } = turnRig();
    await runner.run("find me a 1tb portable ssd", CHAT);
    const record = recorder.current();
    expect(record?.options.map((option) => option.url)).toContain(URL);
    expect(record?.asked).toBe("find me a 1tb portable ssd");
    expect(record?.outcome?.state).toBe("answered");
  });
});

describe("the next turn's planner reads the record as data", () => {
  it("hands the digest to the planner, URL and want included", async () => {
    const { runner, contexts } = turnRig();
    await runner.run("find me a 1tb portable ssd", CHAT);
    await runner.run("anything cheaper out there?", CHAT);
    const digest = contexts[1] ?? "";
    expect(contexts[0]).toBe("");
    expect(digest).toContain("they are after · find me a 1tb portable ssd");
    expect(digest).toContain(URL);
  });
});

describe("a follow-up errand starts at the page already found", () => {
  it("hands the errand the known URL, marked as data", async () => {
    const captured: string[] = [];
    const errand: WebErrand = {
      converse: async (prompt: string) => {
        captured.push(prompt);
        return { transcript: ["seen"], blocked: [], turns: 1, completed: true };
      },
    };
    const hub = new BeatHub(new StepClock(), new RecordingLogger());
    const step = new WebLookStep(
      hub,
      errand,
      new WebTrail(),
      new WebFindings(),
      new SilentLogger(),
      "INR",
      undefined,
      null,
      null,
      { current: () => KNOWN },
    );
    await step.look(emptyResult("r1", "is the crucial one any good?"), look());
    expect(captured[0]).toContain("ALREADY FOUND FOR THEM");
    expect(captured[0]).toContain(URL);
  });
});

describe("a resumed checkout is told what the basket holds", () => {
  it("names the held item as data in the resume errand", () => {
    const said = resumeErrandFor(["yes"], "INR", "address", null, "Crucial E100");
    expect(said).toContain("IN THE SHOP'S BASKET");
    expect(said).toContain("Crucial E100");
  });
});
