// The buyer agent shopping the open web. Every call below goes through the
// real `PreToolUseHook` and the real `GuardedToolDispatcher`; every refusal
// below is the real `FieldClassifier` refusing. Chrome is the only stand-in.
import { WEB_SHOP_TOOLS } from "@covenant/agents";
import { beforeEach, describe, expect, it } from "vitest";

import {
  CHECKOUT,
  HOME,
  PRODUCT,
  REVIEW,
  SIGNIN,
} from "./support/fake-shop.js";
import { webHarness } from "./support/web-harness.js";
import type { WebHarness } from "./support/web-harness.js";

let web: WebHarness;

function refs(body: Record<string, unknown>): { ref: string; text: string }[] {
  const view = body["page"] as { controls?: { ref: string; text: string }[] };
  return view.controls ?? [];
}

function refFor(body: Record<string, unknown>, text: string): string {
  const found = refs(body).find((control) => control.text === text);
  return found?.ref ?? "missing";
}

beforeEach(async () => {
  web = webHarness();
  await web.call("web_open", { url: HOME });
});

describe("the tool surface", () => {
  it("launches a window on demand and reads what is on the page", async () => {
    const body = await web.body("web_read");
    expect(body["ok"]).toBe(true);
    const view = body["page"] as { text: string[]; links: { url: string }[] };
    expect(view.text).toContain("Runners");
    expect(view.links.map((link) => link.url)).toContain(PRODUCT);
  });

  it("is refused before a window exists, and says which call to make", async () => {
    const fresh = webHarness();
    const body = await fresh.body("web_read");
    expect(body["failure"]).toBe("no_window_open");
    expect(String(body["human"])).toContain("web_open");
  });

  it("searches the page's own box and comes back with a fresh reading", async () => {
    const body = await web.body("web_search", { query: "red runners" });
    expect(body["ok"]).toBe(true);
    expect(web.page.typed).toEqual([{ selector: "#q", text: "red runners\n" }]);
  });

  it("puts a thing in the cart by a ref it was handed, never a selector", async () => {
    await web.call("web_open", { url: PRODUCT });
    const read = await web.body("web_read");
    const body = await web.body("web_add_to_cart", {
      ref: refFor(read, "Add to bag"),
    });
    expect(body["ok"]).toBe(true);
    expect(web.page.clicked).toEqual(["#add"]);
  });

  it("refuses a ref that was never read, rather than guessing at one", async () => {
    const body = await web.body("web_add_to_cart", { ref: "c99" });
    expect(body["failure"]).toBe("unknown_ref");
    expect(web.page.clicked).toEqual([]);
  });
});

/** The record the open-web look's closing sentence is written from. A page is
 *  on it because a navigation landed; nothing the model says can add one. */
/**
 * Amazon redirects under the first read on nearly every visit, and puppeteer
 * throws "Execution context was destroyed". That used to propagate past the
 * runner and end the shopper's turn as `failed`.
 */
describe("a page that moves under a read", () => {
  it("comes back as a tool error the agent can act on, never a thrown run", async () => {
    web.page.failNextRead(
      "Execution context was destroyed, most likely because of a navigation.",
    );
    const body = await web.body("web_read");
    expect(body["ok"]).toBe(true);
  });

  it("reports it plainly once the page will not settle at all", async () => {
    web.page.failNextRead("Execution context was destroyed.", 9);
    const body = await web.body("web_read");
    expect(body["failure"]).toBe("page_moved");
    expect(String(body["human"])).toContain("web_read again");
  });
});

describe("where the window actually went", () => {
  it("records a page that landed, and not one the policy refused", async () => {
    const from = web.trail.length;
    await web.call("web_open", { url: PRODUCT });
    await web.call("web_open", { url: "chrome://settings" });
    expect(web.trail.since(from)).toEqual([PRODUCT]);
  });

  it("records where a search landed, not only where the agent opened", async () => {
    const from = web.trail.length;
    await web.call("web_search", { query: "red runners" });
    expect(web.trail.since(from).length).toBeGreaterThan(0);
  });
});

describe("where the window may go", () => {
  it("cannot leave the web: chrome:// is refused by the navigation policy", async () => {
    const body = await web.body("web_open", { url: "chrome://settings" });
    expect(body["ok"]).toBe(false);
    expect(body["failure"]).toBe("navigation_blocked");
  });
});

/**
 * A door only the shopper can open is now something the read *says*, not
 * something it does. The host names what it saw; whether that page is the end
 * of the agent's road is the model's reading of it, and `web_handover` is how
 * that reading moves the wheel.
 */
describe("a door only the shopper can open", () => {
  it("names a sign-in wall in the read instead of stopping on it", async () => {
    await web.call("web_open", { url: SIGNIN });
    const body = await web.body("web_read");
    expect(body["ok"]).toBe(true);
    expect(body["looks_like"]).toEqual(["sign-in"]);
    expect(String((body["because"] as string[])[0])).toContain("Password");
    expect(web.service.current()?.currentState()).toBe("agent-drive");
    expect(web.page.typed).toEqual([]);
  });

  it("names a page that asks for an instrument, and stays at the wheel", async () => {
    await web.call("web_open", { url: CHECKOUT });
    const body = await web.body("web_read");
    expect(body["ok"]).toBe(true);
    expect(body["looks_like"]).toEqual(["payment"]);
    expect(web.service.current()?.currentState()).toBe("agent-drive");
    expect(web.service.current()?.handoff().current()).toBe(null);
    expect(web.page.clicked).toEqual([]);
  });
});

// Invariant 1. The page's own commit button is not a payment path, and the
// tool surface does not get to decide that — the classifier does.
describe("money still leaves only through the covenant gateway", () => {
  it("refuses to press Place order, in the harness's own words", async () => {
    await web.call("web_open", { url: REVIEW });
    const read = await web.body("web_read");
    const body = await web.body("web_add_to_cart", {
      ref: refFor(read, "Place order"),
    });
    expect(body["failure"]).toBe("payment_button");
    expect(body["human"]).toBe(
      "That button commits the payment. Pressing it is the user's act, never the agent's.",
    );
    expect(web.page.clicked).toEqual([]);
  });

  it("keeps the wheel after a refused commit button", async () => {
    await web.call("web_open", { url: REVIEW });
    const read = await web.body("web_read");
    const result = await web.call("web_add_to_cart", {
      ref: refFor(read, "Place order"),
    });
    // Refused, not handed over: a lone commit button is not the step it
    // commits, so the errand keeps the wheel and is told the way to the
    // basket control instead. The payment PAGE still hands over, via the
    // page-level detector.
    expect(result.isError).toBe(true);
    expect(web.service.current()?.currentState()).toBe("agent-drive");
    expect(web.service.current()?.handoff().current() ?? null).toBeNull();
  });
});

// No tool that walks like a browser tool gets to move money either: the
// classifier's boundary is the surface, not the label on the call.
describe("the money gate reads the surface, not the tool's name", () => {
  it("blocks a payment tool that arrives dressed as a browser tool", async () => {
    const result = await web.call("execute_payment", { amount: 1 });
    expect(result.isError).toBe(true);
    expect(web.guard.blocked.map((decision) => decision.reason)).toEqual([
      "money_tool_not_gateway_client",
    ]);
    expect(web.ledger.kinds).toContain("tool.call.blocked");
  });

  it("declares every browser tool non-money, and nothing else", async () => {
    for (const tool of WEB_SHOP_TOOLS) {
      const result = await web.call(tool, { url: HOME, query: "x", ref: "c1" });
      expect(result.content).not.toContain("money_tool_not_gateway_client");
    }
  });
});
