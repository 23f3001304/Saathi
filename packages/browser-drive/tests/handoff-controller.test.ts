import { describe, expect, it } from "vitest";

import { SessionStateError } from "../src/session-state.js";
import { LOGIN, PAY, SHOP } from "./classifier-case.js";
import { el } from "./fakes.js";
import { kinds, rig } from "./harness.js";

const PASSWORD = el({ selector: "#password", inputType: "password", pageUrl: LOGIN });

describe("raise and resume", () => {
  it("exposes stage, reason and url", () => {
    const r = rig({ url: LOGIN });
    const handoff = r.handoff.raise("login", LOGIN);
    expect(handoff.stage).toBe("user-drive");
    expect(handoff.reason).toBe("login");
    expect(handoff.url).toBe(LOGIN);
  });

  it("keeps the first reason when a second block lands", () => {
    const r = rig({ url: LOGIN });
    r.handoff.raise("login", LOGIN);
    const second = r.handoff.raise("payment", PAY);
    expect(second.reason).toBe("login");
    expect(r.journal.count("handoff.raised")).toBe(2);
  });

  it("refuses to resume when nothing is paused", () => {
    const r = rig({ url: SHOP });
    expect(() => r.handoff.resume()).toThrow(SessionStateError);
  });

  it("clears the handoff and returns the wheel on resume", () => {
    const r = rig({ url: LOGIN });
    r.handoff.raise("login", LOGIN);
    expect(r.handoff.resume().reason).toBe("login");
    expect(r.handoff.current()).toBeNull();
    expect(r.state.current()).toBe("agent-drive");
    expect(kinds(r.journal)).toContain("handoff.resumed");
  });
});

describe("waitForUserCompletion", () => {
  it("suggests readiness once the url leaves the blocked context", async () => {
    const r = rig({ url: LOGIN, elements: { "#password": PASSWORD } });
    await r.guarded.type("#password", "hunter2");
    r.page.setUrl("https://bazaar.example/account/home");
    const readiness = await r.handoff.waitForUserCompletion();
    expect(readiness.ready).toBe(true);
    expect(readiness.signals.find((s) => s.name === "url_left_blocked_context")?.met).toBe(true);
  });

  it("suggests readiness on an account marker", async () => {
    const r = rig({ url: LOGIN, elements: { "#password": PASSWORD } });
    await r.guarded.type("#password", "hunter2");
    r.page.setPresent(["a[href*='logout']"]);
    const readiness = await r.handoff.waitForUserCompletion();
    expect(readiness.ready).toBe(true);
  });

  it("never resumes on its own, however ready it looks", async () => {
    const r = rig({ url: LOGIN, elements: { "#password": PASSWORD } });
    await r.guarded.type("#password", "hunter2");
    r.page.setPresent(["a[href*='logout']"]);
    await r.handoff.waitForUserCompletion();
    expect(r.state.current()).toBe("user-drive");
    expect(r.handoff.current()).not.toBeNull();
  });
});

describe("waitForUserCompletion when there is nothing to see", () => {
  it("gives up after maxPolls and says so honestly", async () => {
    const r = rig({ url: LOGIN, elements: { "#password": PASSWORD } });
    await r.guarded.type("#password", "hunter2");
    const readiness = await r.handoff.waitForUserCompletion();
    expect(readiness.ready).toBe(false);
    expect(readiness.polls).toBe(5);
    expect(readiness.human).toContain("Still waiting");
  });

  it("claims no signal for payment, where there is none to have", async () => {
    const r = rig({ url: PAY });
    r.handoff.raise("payment", PAY);
    r.page.setPresent(["a[href*='logout']"]);
    const readiness = await r.handoff.waitForUserCompletion();
    expect(readiness.ready).toBe(false);
    expect(readiness.human).toContain("no reliable signal");
  });

  it("throws when nothing is paused", async () => {
    const r = rig({ url: SHOP });
    await expect(r.handoff.waitForUserCompletion()).rejects.toThrow(SessionStateError);
  });
});

describe("requestFinalReview", () => {
  const CART = {
    rows: [{ text: "Trailfoot Runner ₹3,499.00", priceText: "₹3,499.00", qtyText: "Qty: 1" }],
    totalCandidates: ["Grand total ₹4,299.00"],
    url: PAY,
  };

  it("hands off to final review when the cart is inside the cap", async () => {
    const r = rig({ url: PAY, cart: CART, capPaise: 500_000 });
    const result = await r.review.run(r.guarded);
    expect(result.ok).toBe(true);
    expect(r.handoff.current()?.reason).toBe("final-review");
  });

  it("refuses, and does not hand off to payment, when over the cap", async () => {
    const r = rig({ url: PAY, cart: CART, capPaise: 150_000 });
    const result = await r.review.run(r.guarded);
    expect(result.ok).toBe(false);
    expect(r.handoff.current()).toBeNull();
    expect(r.state.current()).toBe("agent-drive");
    expect(kinds(r.journal)).toContain("handoff.refused");
  });

  it("says plainly that nothing was paid and the window is the user's", async () => {
    const r = rig({ url: PAY, cart: CART, capPaise: 150_000 });
    const result = await r.review.run(r.guarded);
    if (result.ok) {
      throw new Error("expected a refusal");
    }
    expect(result.human).toContain("nothing has been paid");
    expect(result.rule).toBe("covenant_over_cap");
  });

  it("journals the cart reading and the covenant check either way", async () => {
    const r = rig({ url: PAY, cart: CART, capPaise: 150_000 });
    await r.review.run(r.guarded);
    expect(kinds(r.journal)).toContain("cart.inspected");
    expect(kinds(r.journal)).toContain("covenant.checked");
  });
});
