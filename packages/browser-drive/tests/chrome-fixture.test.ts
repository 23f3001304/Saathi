import { existsSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { GuardedPage } from "../src/drive/guarded-page.js";
import type { BrowserSession } from "../src/session/browser-session.js";
import { buildSession, LAUNCH_MS, probeChrome } from "./chrome-session.js";
import { fixtureUrl } from "./fakes.js";

const SKIP_REASON = await probeChrome();
if (SKIP_REASON !== null) {
  console.warn(`[browser-drive] real-Chrome suite SKIPPED: ${SKIP_REASON}`);
}

let session: BrowserSession;
let page: GuardedPage;
let profileDir = "";

// File-level hooks: one Chrome launch shared by the groups below, so the
// suite costs a single window rather than one per describe.
beforeAll(async () => {
  if (SKIP_REASON !== null) {
    return;
  }
  session = buildSession();
  page = await session.launch();
  profileDir = launchedProfile(session);
}, LAUNCH_MS);

afterAll(async () => {
  if (SKIP_REASON !== null) {
    return;
  }
  await session.close();
}, LAUNCH_MS);

const chrome = describe.skipIf(SKIP_REASON !== null);

chrome("the sandboxed window", () => {
  it("runs in a visible, disposable profile under the temp dir", () => {
    expect(profileDir).not.toBe("");
    expect(existsSync(profileDir)).toBe(true);
    const launched = session
      .journalEntries()
      .find((event) => event.kind === "session.launched");
    expect(launched?.detail).toMatchObject({
      surface: "native-window",
      sandbox_id: "in-process",
      shares_user_profile: false,
    });
  });

  it("types into an ordinary search box", async () => {
    await page.navigate(fixtureUrl("index.html"));
    const result = await page.type("#q", "trail shoes");
    expect(result.ok).toBe(true);
  });

  it("refuses chrome://settings", async () => {
    const result = await page.navigate("chrome://settings/passwords");
    expect(result.ok).toBe(false);
    expect(page.url()).not.toContain("chrome://");
  });

  it("refuses a file outside the fixture root", async () => {
    const result = await page.navigate("file:///C:/Windows/win.ini");
    expect(result.ok).toBe(false);
  });
});

chrome("credential blocks", () => {
  it("blocks the real password field and pauses for the user", async () => {
    await page.navigate(fixtureUrl("login.html"));
    const result = await page.type("#password", "hunter2");
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.category).toBe("password");
    expect(session.currentState()).toBe("user-drive");
    expect(session.handoff().current()?.reason).toBe("login");
  });

  it("performs no page action at all while the user drives", async () => {
    await expect(page.type("#email", "a@b.com")).rejects.toThrow();
    await expect(page.click("#sign-in")).rejects.toThrow();
    session.handoff().resume();
    expect(session.currentState()).toBe("agent-drive");
    // Only now, back in agent-drive, can the field be read — and it is empty.
    expect(await valueOf(page, "#password")).toBe("");
  });
});

chrome("payment blocks", () => {
  it("blocks the real Place order button and keeps the wheel", async () => {
    await page.navigate(fixtureUrl("checkout.html"));
    const result = await page.click("#place-order");
    expect(result.ok).toBe(false);
    // Refused, not handed over: a lone commit button is not the step it
    // commits. The wheel stays with the agent, which continues the errand.
    expect(session.currentState()).toBe("agent-drive");
  });

  it("blocks the Hindi payment button", async () => {
    const result = await page.click("#pay-hindi");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.category).toBe("payment_button");
    }
    expect(session.currentState()).toBe("agent-drive");
  });

  it("blocks the real card and CVV fields", async () => {
    for (const selector of ["#card-number", "#cvv", "#upi"]) {
      const result = await page.type(selector, "4111111111111111");
      expect(result.ok).toBe(false);
      session.handoff().resume();
      expect(await valueOf(page, selector)).toBe("");
    }
  });
});

chrome("cart and covenant", () => {
  it("reads the real cart total out of the DOM", async () => {
    await page.navigate(fixtureUrl("cart.html"));
    const reading = await session.review().inspect(page);
    expect(reading.totalPaise).toBe(379900);
    expect(reading.confidence).toBe("high");
    expect(reading.items).toHaveLength(2);
  });

  it("refuses the final-review handoff when the cart is over cap", async () => {
    await page.navigate(fixtureUrl("checkout.html"));
    const result = await session.review().run(page);
    expect(result.ok).toBe(false);
    expect(session.handoff().current()).toBeNull();
    expect(session.currentState()).toBe("agent-drive");
  });
});

function launchedProfile(session: BrowserSession): string {
  const launched = session
    .journalEntries()
    .find((event) => event.kind === "session.launched");
  const dir = launched?.detail["user_data_dir"];
  return typeof dir === "string" ? dir : "";
}

/** Reads the live DOM value, so "the agent did not type it" is checked, not assumed. */
async function valueOf(page: GuardedPage, selector: string): Promise<string> {
  const result = await page.readValue(selector);
  return result.ok ? result.value : "";
}
