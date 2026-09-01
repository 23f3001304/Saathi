// A shop asking to check the shopper is human. The agent has never been able
// to touch one — a challenge is a third-party document, and an unreadable
// target cannot be protected — so what this proves is that the dead end became
// a handoff: the wheel moves, the window survives, and nobody automated a
// bot check to get past it.
import { beforeEach, describe, expect, it } from "vitest";

import { CHECKPOINT, HOME, PRODUCT } from "./support/fake-shop.js";
import { webHarness } from "./support/web-harness.js";
import type { WebHarness } from "./support/web-harness.js";

let web: WebHarness;

beforeEach(async () => {
  web = webHarness();
  await web.call("web_open", { url: HOME });
});

describe("the agent meets a bot check", () => {
  it("stops, and says who can answer it", async () => {
    await web.call("web_open", { url: CHECKPOINT });
    const body = await web.body("web_read");
    expect(body["ok"]).toBe(false);
    expect(body["failure"]).toBe("bot_check");
    expect(body["signal"]).toBe("challenge_widget");
    expect(String(body["human"])).toContain("will not try");
    expect(String(body["human"])).toContain("yours");
  });

  it("attempts nothing at all — no click, no keystroke", async () => {
    await web.call("web_open", { url: CHECKPOINT });
    await web.call("web_read");
    await web.call("web_search", { query: "anything" });
    expect(web.page.clicked).toEqual([]);
    expect(web.page.typed).toEqual([]);
  });

  it("hands the window to the shopper, with the reason on the card", async () => {
    await web.call("web_open", { url: CHECKPOINT });
    await web.call("web_read");
    const session = web.service.current();
    expect(session?.currentState()).toBe("user-drive");
    expect(session?.handoff()?.current()?.reason).toBe("captcha");
    expect(web.service.card().handoff?.ask).toContain("bot check");
  });

  it("cannot take the wheel back on its own", async () => {
    await web.call("web_open", { url: CHECKPOINT });
    await web.call("web_read");
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
    await web.call("web_open", { url: CHECKPOINT });
    await web.call("web_read");
    const held = web.service.current()?.currentState() === "user-drive";
    expect(held).toBe(true);
    expect(web.service.isOpen).toBe(true);
  });

  it("picks up in the same window once they hand it back", async () => {
    await web.call("web_open", { url: CHECKPOINT });
    await web.call("web_read");
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
    expect(web.service.current()?.currentState()).toBe("agent-drive");
  });
});
