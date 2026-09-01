import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { GuardedPage } from "../src/drive/guarded-page.js";
import { decodePng } from "../src/frame/png.js";
import { REDACTION_RGBA } from "../src/frame/redact.js";
import type { FieldSnapshot, Rect } from "../src/ports.js";
import type { BrowserSession } from "../src/session/browser-session.js";
import { buildSession, LAUNCH_MS, probeChrome } from "./chrome-session.js";
import { fixtureUrl, frameOf } from "./fakes.js";

const SKIP_REASON = await probeChrome("probe-relay");
if (SKIP_REASON !== null) {
  console.warn(
    `[browser-drive] frame/relay Chrome suite SKIPPED: ${SKIP_REASON}`,
  );
}

let session: BrowserSession;
let page: GuardedPage;

beforeAll(async () => {
  if (SKIP_REASON !== null) return;
  session = buildSession("chrome_relay");
  page = await session.launch();
}, LAUNCH_MS);

afterAll(async () => {
  if (SKIP_REASON !== null) return;
  await session.close();
}, LAUNCH_MS);

const chrome = describe.skipIf(SKIP_REASON !== null);

function pixelAt(
  image: { width: number; pixels: Uint8Array },
  x: number,
  y: number,
): number[] {
  const at = (y * image.width + Math.round(x)) * 4;
  return [...image.pixels.subarray(at, at + 4)];
}

function centreOf(rect: Rect): readonly [number, number] {
  return [
    Math.round(rect.x + rect.width / 2),
    Math.round(rect.y + rect.height / 2),
  ];
}

async function boxOf(id: string): Promise<FieldSnapshot | undefined> {
  const fields = await session.fields();
  return fields.find((snap) => snap.descriptor.id === id);
}

chrome("the frame that leaves the machine", () => {
  it("has the real password box painted out, pixel by pixel", async () => {
    await page.navigate(fixtureUrl("login.html"));
    const box = await boxOf("password");
    const frame = frameOf(await session.screenshot());
    expect(box).toBeDefined();
    if (box === undefined) return;
    expect(frame.redacted).toBeGreaterThan(0);
    const image = decodePng(frame.bytes);
    const [cx, cy] = centreOf(box.rect);
    expect(pixelAt(image, cx, cy)).toEqual([...REDACTION_RGBA]);
    expect(pixelAt(image, box.rect.x + 2, cy)).toEqual([...REDACTION_RGBA]);
  });

  /**
   * On a sign-in page the classifier calls the whole form the user's, email box
   * included, so that page cannot show the difference. This one can: an
   * ordinary shop page with one secret on it — the voucher PIN goes dark and
   * the recipient box beside it does not.
   */
  it("blanks only the field the classifier names, not its neighbour", async () => {
    await page.navigate(fixtureUrl("gift.html"));
    const pin = await boxOf("voucher-pin");
    const plain = await boxOf("recipient");
    const frame = frameOf(await session.screenshot());
    const image = decodePng(frame.bytes);
    expect(pin).toBeDefined();
    expect(plain).toBeDefined();
    if (pin === undefined || plain === undefined) return;
    expect(frame.redacted).toBe(1);
    const [px, py] = centreOf(pin.rect);
    const [rx, ry] = centreOf(plain.rect);
    expect(pixelAt(image, px, py)).toEqual([...REDACTION_RGBA]);
    expect(pixelAt(image, rx, ry)).not.toEqual([...REDACTION_RGBA]);
  });
});

chrome("the relay, against real Chrome", () => {
  it("refuses the password box and leaves it empty", async () => {
    await page.navigate(fixtureUrl("login.html"));
    const box = await boxOf("password");
    // The agent's own attempt is what moves the wheel; the relay lives after.
    expect((await page.type("#password", "hunter2")).ok).toBe(false);
    expect(session.currentState()).toBe("user-drive");
    expect(box).toBeDefined();
    if (box === undefined) return;
    const [cx, cy] = centreOf(box.rect);
    const clicked = await session.input().click(cx, cy);
    expect(clicked.ok).toBe(false);
    if (clicked.ok) return;
    expect(clicked.category).toBe("password");
    session.handoff().resume();
    expect(await valueOf("#password")).toBe("");
  });

  it("carries an ordinary click and keystroke into the real page", async () => {
    await page.navigate(fixtureUrl("gift.html"));
    const box = await boxOf("recipient");
    session.handoff().raise("final-review", page.url());
    expect(box).toBeDefined();
    if (box === undefined) return;
    const [cx, cy] = centreOf(box.rect);
    expect((await session.input().click(cx, cy)).ok).toBe(true);
    expect((await session.input().type("Asha")).ok).toBe(true);
    session.handoff().resume();
    expect(await valueOf("#recipient")).toBe("Asha");
    expect(
      session
        .journalEntries()
        .filter((event) => event.actor === "user")
        .map((event) => event.kind),
    ).toContain("page.typed");
  });
});

/**
 * The sharpest case: one page, no auth or checkout context, two neighbouring
 * boxes. Tabbing out of the allowed one lands on the secret, and the very next
 * relayed keystroke is refused — the guard reads the target, not the page it
 * happens to be on.
 */
chrome("a mixed page, one secret", () => {
  it("refuses the keystroke after Tab lands on the voucher PIN", async () => {
    session.handoff().raise("final-review", page.url());
    expect((await session.input().key("Tab")).ok).toBe(true);
    const typed = await session.input().type("123456");
    expect(typed.ok).toBe(false);
    if (typed.ok) return;
    expect(typed.category).toBe("otp");
    session.handoff().resume();
    expect(await valueOf("#voucher-pin")).toBe("");
    expect(await valueOf("#recipient")).toBe("Asha");
  });
});

async function valueOf(selector: string): Promise<string> {
  const result = await page.readValue(selector);
  return result.ok ? result.value : "";
}
