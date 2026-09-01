import { describe, expect, it } from "vitest";

import { UserDriveViolation } from "../src/session-state.js";
import { LOGIN, PAY, SHOP } from "./classifier-case.js";
import { button, el } from "./fakes.js";
import { kinds, rig } from "./harness.js";

const PASSWORD = el({ selector: "#password", inputType: "password", pageUrl: LOGIN });
const CARD = el({ selector: "#card-number", autocomplete: "cc-number", pageUrl: PAY });
const PLACE_ORDER = button("Place order", { selector: "#place-order", pageUrl: PAY });
const SEARCH = el({ selector: "#q", name: "q", inputType: "search", pageUrl: SHOP });

describe("GuardedPage blocks", () => {
  it("refuses to type into a password field and never reaches the page", async () => {
    const r = rig({ url: LOGIN, elements: { "#password": PASSWORD } });
    const result = await r.guarded.type("#password", "hunter2");
    expect(result.ok).toBe(false);
    expect(r.page.typed).toEqual([]);
  });

  it("returns a typed refusal rather than throwing", async () => {
    const r = rig({ url: LOGIN, elements: { "#password": PASSWORD } });
    const result = await r.guarded.type("#password", "hunter2");
    if (result.ok) {
      throw new Error("expected a refusal");
    }
    expect(result.reason).toBe("sensitive_field");
    expect(result.category).toBe("password");
    expect(result.rule).toBe("password_input_type");
    expect(result.handoffReason).toBe("login");
    expect(result.human).toContain("password");
  });

  it("refuses card fields", async () => {
    const r = rig({ url: PAY, elements: { "#card-number": CARD } });
    const result = await r.guarded.type("#card-number", "4111111111111111");
    expect(result.ok).toBe(false);
    expect(r.page.typed).toEqual([]);
  });

  it("refuses to click a payment button", async () => {
    const r = rig({ url: PAY, elements: { "#place-order": PLACE_ORDER } });
    const result = await r.guarded.click("#place-order");
    expect(result.ok).toBe(false);
    expect(r.page.clicked).toEqual([]);
  });
});

describe("GuardedPage journals what it refused", () => {
  it("journals the block with the rule that fired", async () => {
    const r = rig({ url: LOGIN, elements: { "#password": PASSWORD } });
    await r.guarded.type("#password", "hunter2");
    const blocked = r.journal.entries().find((e) => e.kind === "action.blocked");
    expect(blocked?.detail).toMatchObject({
      action: "type",
      rule: "password_input_type",
      category: "password",
      handoff: "login",
    });
  });

  it("never journals the text it refused to type", async () => {
    const r = rig({ url: LOGIN, elements: { "#password": PASSWORD } });
    await r.guarded.type("#password", "correct horse battery staple");
    expect(r.sink.all().join("\n")).not.toContain("correct horse");
  });

  it("hands the wheel to the user on a block", async () => {
    const r = rig({ url: LOGIN, elements: { "#password": PASSWORD } });
    await r.guarded.type("#password", "hunter2");
    expect(r.state.current()).toBe("user-drive");
    expect(r.handoff.current()?.reason).toBe("login");
    expect(kinds(r.journal)).toContain("handoff.raised");
  });
});

describe("GuardedPage allows ordinary work", () => {
  it("types into a search box and journals it", async () => {
    const r = rig({ url: SHOP, elements: { "#q": SEARCH } });
    const result = await r.guarded.type("#q", "trail shoes");
    expect(result.ok).toBe(true);
    expect(r.page.typed).toEqual([{ selector: "#q", text: "trail shoes" }]);
    expect(kinds(r.journal)).toContain("page.typed");
  });

  it("refuses cleanly when the element is not there", async () => {
    const r = rig({ url: SHOP });
    const result = await r.guarded.click("#nope");
    expect(result.ok).toBe(false);
    expect(r.state.current()).toBe("agent-drive");
  });
});

describe("navigation", () => {
  it("flags a checkout page but still loads it, so the cart can be read", async () => {
    const r = rig({ url: SHOP });
    const result = await r.guarded.navigate(PAY);
    expect(result.ok).toBe(true);
    expect(r.page.visited).toEqual([PAY]);
    expect(kinds(r.journal)).toContain("context.flagged");
    expect(r.state.current()).toBe("agent-drive");
  });

  it("does not flag an ordinary product page", async () => {
    const r = rig({ url: SHOP });
    await r.guarded.navigate(SHOP);
    expect(kinds(r.journal)).not.toContain("context.flagged");
  });
});

describe("the freeze during user-drive", () => {
  it("throws on every page action once the user is driving", async () => {
    const r = rig({
      url: LOGIN,
      elements: { "#password": PASSWORD, "#q": SEARCH },
    });
    await r.guarded.type("#password", "hunter2");
    expect(r.state.current()).toBe("user-drive");
    await expect(r.guarded.type("#q", "x")).rejects.toThrow(UserDriveViolation);
    await expect(r.guarded.click("#q")).rejects.toThrow(UserDriveViolation);
    await expect(r.guarded.navigate(SHOP)).rejects.toThrow(UserDriveViolation);
    await expect(r.guarded.readText("#q")).rejects.toThrow(UserDriveViolation);
    await expect(r.guarded.scrapeCart()).rejects.toThrow(UserDriveViolation);
  });

  it("performs zero page operations while frozen", async () => {
    const r = rig({
      url: LOGIN,
      elements: { "#password": PASSWORD, "#q": SEARCH },
    });
    await r.guarded.type("#password", "hunter2");
    await r.guarded.type("#q", "x").catch(() => null);
    await r.guarded.click("#q").catch(() => null);
    await r.guarded.navigate(SHOP).catch(() => null);
    expect(r.page.typed).toEqual([]);
    expect(r.page.clicked).toEqual([]);
    expect(r.page.visited).toEqual([]);
  });
});

describe("resuming after a freeze", () => {
  it("acts again only after an explicit resume", async () => {
    const r = rig({
      url: LOGIN,
      elements: { "#password": PASSWORD, "#q": SEARCH },
    });
    await r.guarded.type("#password", "hunter2");
    r.handoff.resume();
    expect(r.state.current()).toBe("agent-drive");
    const result = await r.guarded.type("#q", "trail shoes");
    expect(result.ok).toBe(true);
  });
});
