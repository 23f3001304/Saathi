// The three invariants that outlive any tool list: the agent types no
// credential, a scraped price stays P0, and the ceiling that bounds a purchase
// is the signed one. Same harness, same real guards.
import { beforeEach, describe, expect, it } from "vitest";

import {
  CART,
  CART_PAISE,
  CHECKOUT,
  CHECKOUT_PAISE,
  HOME,
  LOGIN,
  PRODUCT,
} from "./support/fake-shop.js";
import { webHarness } from "./support/web-harness.js";
import type { WebHarness } from "./support/web-harness.js";

const CEILING = { capPaise: 300_000, currency: "INR" };

let web: WebHarness;

beforeEach(async () => {
  web = webHarness();
  await web.call("web_open", { url: HOME });
});

// Invariant 2. There is no tool that types a credential, and the one tool that
// types anything is refused wherever the classifier says the field is theirs.
describe("the agent never types a credential", () => {
  it("refuses to type into a box inside a sign-in scope", async () => {
    await web.call("web_open", { url: LOGIN });
    const body = await web.body("web_search", { query: "anything" });
    expect(body["ok"]).toBe(false);
    expect(body["category"]).toBe("login_context");
    expect(web.page.typed).toEqual([]);
  });

  it("moves control to the user on that refusal, with no way back on its own", async () => {
    await web.call("web_open", { url: LOGIN });
    await web.call("web_search", { query: "anything" });
    const session = web.service.current();
    expect(session?.currentState()).toBe("user-drive");
    const blocked = await web.body("web_read");
    expect(blocked["failure"]).toBe("user_is_driving");
  });
});

// Invariant 3. A scraped price is P0 untrusted text and says so on the wire.
describe("a price read off a web page is untrusted text", () => {
  it("stamps every reading P0 / untrusted_text, unsigned", async () => {
    await web.call("web_open", { url: PRODUCT });
    const body = await web.body("web_read");
    expect(body["provenance"]).toMatchObject({
      tier: "P0",
      source_channel: "untrusted_text",
      signed: false,
    });
    expect(String((body["provenance"] as { note: string }).note)).toContain(
      "not a quote",
    );
  });

  it("carries the same stamp on the cart total it just checked a cap with", async () => {
    web.service.bindCeiling(CEILING);
    await web.call("web_open", { url: CART });
    const body = await web.body("web_cart");
    expect(body["total_paise_read"]).toBe(CART_PAISE);
    expect(body["provenance"]).toMatchObject({ tier: "P0", signed: false });
  });
});

// Invariant 4. The signed intent's ceiling bounds the purchase; the page's own
// number is only ever allowed to fail the check.
describe("a cart total read from a page cannot bound a purchase", () => {
  it("refuses to assist at all when nothing signed set a ceiling", async () => {
    await web.call("web_open", { url: CART });
    const body = await web.body("web_cart");
    expect(body["failure"]).toBe("no_signed_intent");
    expect(String(body["human"])).toContain("sign a covenant");
    expect(web.service.current()?.handoff().current()).toBeNull();
  });

  it("stops without opening the payment step when the page is over the ceiling", async () => {
    web.service.bindCeiling(CEILING);
    await web.call("web_open", { url: CHECKOUT });
    const body = await web.body("web_cart");
    expect(body["total_paise_read"]).toBe(CHECKOUT_PAISE);
    expect(body["cap_paise"]).toBe(CEILING.capPaise);
    expect(body["cap_source"]).toBe("signed_intent_mandate");
    expect(body["outcome"]).toBe("over_cap");
    expect(body["payment_step_opened"]).toBe(false);
    expect(web.service.current()?.handoff().current()).toBeNull();
    expect(web.service.current()?.currentState()).toBe("agent-drive");
  });

  it("opens the final review only when the reading is inside that ceiling", async () => {
    web.service.bindCeiling(CEILING);
    await web.call("web_open", { url: CART });
    const body = await web.body("web_cart");
    expect(body["outcome"]).toBe("within_cap");
    expect(body["payment_step_opened"]).toBe(true);
    expect(web.service.current()?.handoff().current()?.reason).toBe(
      "final-review",
    );
  });
});

describe("the trail the cap check leaves", () => {
  it("journals the covenant check with the cap it actually held", async () => {
    web.service.bindCeiling(CEILING);
    await web.call("web_open", { url: CHECKOUT });
    await web.call("web_cart");
    const checked = web.journal.events.find(
      (event) => event.kind === "covenant.checked",
    );
    expect(checked?.detail).toMatchObject({
      outcome: "over_cap",
      capPaise: CEILING.capPaise,
      observedPaise: CHECKOUT_PAISE,
    });
    expect(
      web.journal.events.some((event) => event.kind === "handoff.refused"),
    ).toBe(true);
  });
});
