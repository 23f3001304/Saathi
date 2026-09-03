// The founder's log read `web_pick.close handed: payment, carted: false,
// filled: 0` on an Amazon product page: a DOM classifier saw a Buy Now button,
// decided the page *was* the payment step, and gave the window away before the
// errand had made a single move. What follows proves the two halves of the
// fix: a read now says what the page looks like, and only the model's own
// `web_handover` moves the wheel.
import { describe, expect, it } from "vitest";
import { WEB_HANDOVER_TOOL, WEB_SHOP_TOOLS } from "@covenant/agents";
import type { Handoff, HandoffReason } from "@covenant/browser-drive";

import { observeWindow } from "../src/browser/web-handover.js";
import { HandoverMove } from "../src/browser/web-handover-move.js";
import { WebProgress } from "../src/browser/web-progress.js";
import { stepLabel } from "../src/purchase/web-steps.js";
import { CHECKOUT } from "./support/fake-shop.js";
import { button, field, page } from "./support/fake-shop-build.js";
import { webHarness } from "./support/web-harness.js";

const PRODUCT = "https://shop.example/product/red-runners";

interface FakeSession {
  readonly raised: { reason: HandoffReason; url: string }[];
  url(): string;
  handoff(): { raise(reason: HandoffReason, url: string): Handoff };
}

function fakeSession(at = PRODUCT): FakeSession {
  const raised: { reason: HandoffReason; url: string }[] = [];
  return {
    raised,
    url: () => at,
    handoff: () => ({
      raise: (reason, url) => {
        raised.push({ reason, url });
        return { stage: "user-drive", reason, url, at: "2026-09-03T00:00:00Z" };
      },
    }),
  };
}

describe("a read observes, it does not stop", () => {
  it("names a Buy Now page as looking like payment", () => {
    const seen = observeWindow(
      page(PRODUCT, { controls: [button("#buy", "Buy Now")] }).dom,
    );
    expect(seen.looks_like).toEqual(["payment"]);
    expect(seen.because[0]).toMatch(/Buy Now/);
  });

  it("sees nothing worth naming on an ordinary product page", () => {
    const seen = observeWindow(
      page(PRODUCT, { controls: [button("#add", "Add to bag")] }).dom,
    );
    expect(seen.looks_like).toEqual([]);
    expect(seen.because).toEqual([]);
  });
});

describe("a read names every step it can see, and says what gave it away", () => {
  it("names a sign-in wall and a human check by what gave them away", () => {
    const wall = observeWindow(
      page("https://shop.example/checkout/identify", {
        controls: [field("#password", "Password", "password")],
      }).dom,
    );
    expect(wall.looks_like).toContain("sign-in");
    expect(wall.because[0]).toMatch(/Password/);
    const check = observeWindow(
      page("https://shop.example/checkpoint", {
        frames: ["https://challenges.cloudflare.com/cdn-cgi/x"],
      }).dom,
    );
    expect(check.looks_like).toEqual(["human-check"]);
  });

  it("names every look a page carries, earliest step first", () => {
    const seen = observeWindow(
      page("https://shop.example/checkout", {
        controls: [
          field("#password", "Password", "password"),
          field("#card-number", "Card number", "text"),
        ],
      }).dom,
    );
    expect(seen.looks_like).toEqual(["sign-in", "payment"]);
  });
});

describe("the window becomes the shopper's when the model says so", () => {
  it("raises the handoff only when the model asks", async () => {
    const session = fakeSession();
    const progress = new WebProgress();
    const move = new HandoverMove(() => session, progress);
    const result = await move.raise(
      "payment",
      "the page is asking for a card number",
    );
    expect(session.raised).toEqual([{ reason: "payment", url: PRODUCT }]);
    expect(progress.handedOver).toBe("payment");
    expect(result.isError).toBe(false);
    expect(String(result.body["human"])).toContain("payment step");
  });

  it("uses the session's own names for the reasons it is given", async () => {
    const seen: HandoffReason[] = [];
    for (const reason of ["sign-in", "human-check", "other"] as const) {
      const session = fakeSession();
      const move = new HandoverMove(() => session, new WebProgress());
      await move.raise(reason, "one sentence they will read");
      seen.push(session.raised[0].reason);
    }
    expect(seen).toEqual(["login", "captcha", "final-review"]);
  });

  it("says the model's own sentence when the reason has no stop copy", async () => {
    const session = fakeSession();
    const move = new HandoverMove(() => session, new WebProgress());
    const result = await move.raise("other", "the shop wants your PAN number");
    expect(result.body["human"]).toBe("the shop wants your PAN number");
    expect(result.body["why"]).toBe("the shop wants your PAN number");
  });
});

describe("what the move records, and what it does with nothing to hand", () => {
  it("keeps the first reason the window was handed over for", async () => {
    const session = fakeSession();
    const progress = new WebProgress();
    const move = new HandoverMove(() => session, progress);
    await move.raise("sign-in", "the shop wants an account");
    await move.raise("payment", "and now a card");
    expect(progress.handedOver).toBe("login");
  });

  it("has nothing to hand over when no window is open", async () => {
    const move = new HandoverMove(() => null, new WebProgress());
    const result = await move.raise("payment", "nowhere to point them");
    expect(result.isError).toBe(true);
    expect(result.body["failure"]).toBe("no_window_open");
  });
});

describe("web_handover through the real tool surface", () => {
  it("is a shopping tool the hook lets through, and it moves the wheel", async () => {
    expect(WEB_SHOP_TOOLS).toContain(WEB_HANDOVER_TOOL);
    const web = webHarness();
    await web.call("web_open", { url: CHECKOUT });
    const body = await web.body(WEB_HANDOVER_TOOL, {
      reason: "payment",
      why: "this page wants a card number and that is yours to give",
    });
    expect(body["ok"]).toBe(true);
    expect(body["handed_to_user"]).toBe(true);
    expect(web.service.current()?.currentState()).toBe("user-drive");
    expect(web.service.current()?.handoff().current()?.reason).toBe("payment");
    expect(web.progress.handedOver).toBe("payment");
  });

  it("refuses a reason it does not know, rather than guessing one", async () => {
    const web = webHarness();
    await web.call("web_open", { url: CHECKOUT });
    const body = await web.body(WEB_HANDOVER_TOOL, {
      reason: "because",
      why: "",
    });
    expect(body["ok"]).toBe(false);
    expect(body["failure"]).toBe("bad_arguments");
    expect(web.service.current()?.currentState()).toBe("agent-drive");
  });

  // The handover used to reach the shopper's trail as a failed read ("Read the
  // page · stopped, the payment step is yours"). The model makes it by name
  // now, so the pill names it too rather than the trail going quiet on the one
  // move that ends the errand.
  it("writes itself down in the trail the shopper reads", () => {
    expect(stepLabel(WEB_HANDOVER_TOOL, { reason: "payment" }, null)).toBe(
      "Handed the window to you",
    );
  });
});
