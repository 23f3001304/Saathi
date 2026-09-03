// A shop asking to check the shopper is human. What this file proves is that
// the dead end became a handoff without anything automating a bot check to get
// past it: the read names the check and moves no wheel, the model gives the
// window over by name, the window survives long enough for a person to work
// through it — and if the model aims at the check instead, the classifier
// refuses the control and hands the window over anyway. The floor under all of
// that is the classifier's `captcha_context` rule, table-tested in
// `packages/browser-drive/tests/cases-actions.ts`, and `RelayGate`, which
// cannot describe the widget itself: it is a third-party document, and an
// unreadable target cannot be protected.
import { beforeEach, describe, expect, it } from "vitest";

import { CHECKPOINT, HOME, PRODUCT } from "./support/fake-shop.js";
import { webHarness } from "./support/web-harness.js";
import type { WebHarness } from "./support/web-harness.js";

let web: WebHarness;

const HANDED = {
  reason: "human-check",
  why: "this shop wants to check you are a person, which only you can answer",
};

async function metTheCheck(): Promise<void> {
  await web.call("web_open", { url: CHECKPOINT });
  await web.call("web_read");
  await web.call("web_handover", HANDED);
}

beforeEach(async () => {
  web = webHarness();
  await web.call("web_open", { url: HOME });
});

describe("the agent meets a bot check", () => {
  it("names it in the read rather than deciding for the model", async () => {
    await web.call("web_open", { url: CHECKPOINT });
    const body = await web.body("web_read");
    expect(body["ok"]).toBe(true);
    expect(body["looks_like"]).toEqual(["human-check"]);
    expect(String((body["because"] as string[])[0])).toContain(
      "challenge_widget",
    );
    expect(web.service.current()?.currentState()).toBe("agent-drive");
  });

  it("says who can answer it once the model hands the window over", async () => {
    await web.call("web_open", { url: CHECKPOINT });
    const body = await web.body("web_handover", HANDED);
    expect(body["ok"]).toBe(true);
    expect(body["handed_to_user"]).toBe(true);
    expect(String(body["human"])).toContain("will not try");
    expect(String(body["human"])).toContain("yours");
  });

  /**
   * The floor, which this change did not move. A read observes now instead of
   * stopping, so the thing that stands between the agent and a challenge is no
   * longer the stop: it is the real `FieldClassifier`, which refuses any
   * control in a bot-check context and hands the window over on the refusal.
   * Nothing reaches the window - no click, no keystroke - however the aim was
   * taken.
   */
  it("is refused if the model aims at the check anyway", async () => {
    await web.call("web_open", { url: CHECKPOINT });
    await web.call("web_read");
    const aimed = await web.body("web_add_to_cart", { ref: "c1" });
    expect(aimed["rule"]).toBe("captcha_context");
    expect(aimed["handoff_reason"]).toBe("captcha");
    expect(String(aimed["human"])).toContain("yours to do");
    expect(web.page.clicked).toEqual([]);
    expect(web.page.typed).toEqual([]);
  });
});

/** What the model's own move does once it makes it: the wheel goes over, and
 *  stays over until the shopper gives it back. */
describe("the window the model hands over", () => {
  it("hands the window to the shopper, with the reason on the card", async () => {
    await metTheCheck();
    const session = web.service.current();
    expect(session?.currentState()).toBe("user-drive");
    expect(session?.handoff()?.current()?.reason).toBe("captcha");
    expect(web.service.card().handoff?.ask).toContain("bot check");
  });

  it("cannot take the wheel back on its own", async () => {
    await metTheCheck();
    const blocked = await web.body("web_open", { url: PRODUCT });
    expect(blocked["failure"]).toBe("user_is_driving");
  });
});

/**
 * The pause has to outlive the person taking their time over it. A window in
 * `user-drive` is refused retirement by `sandboxOf` in `runner-wiring.ts`, and
 * `BrowserService` will not let the idle sweep reap one either — somebody
 * reading a challenge is "nobody" to a watcher count.
 */
describe("a window the shopper is working in", () => {
  it("survives the run that would otherwise retire it", async () => {
    await metTheCheck();
    const held = web.service.current()?.currentState() === "user-drive";
    expect(held).toBe(true);
    expect(web.service.isOpen).toBe(true);
  });

  it("picks up in the same window once they hand it back", async () => {
    await metTheCheck();
    expect(web.service.resume()).toBe(true);
    const read = await web.body("web_open", { url: PRODUCT });
    expect(read["ok"]).toBe(true);
    // The same session, not a fresh one: whatever the shopper did in that
    // window — solved the check, signed in, half-filled a basket — is still
    // there, because nothing closed it.
    expect(web.service.openSessionId).toBe("web_web");
  });
});

describe("an ordinary page is not a bot check", () => {
  it("reads normally where nothing is asking", async () => {
    await web.call("web_open", { url: PRODUCT });
    const body = await web.body("web_read");
    expect(body["ok"]).toBe(true);
    expect(body["looks_like"]).toEqual([]);
    expect(web.service.current()?.currentState()).toBe("agent-drive");
  });
});
