import { CartCovenant } from "../src/cart/cart-covenant.js";
import { CartInspector } from "../src/cart/cart-inspector.js";
import { PuppeteerLauncher } from "../src/chrome/puppeteer-launcher.js";
import { NavigationPolicy } from "../src/drive/navigation-policy.js";
import { FieldClassifier } from "../src/field/field-classifier.js";
import { DEFAULT_HANDOFF_CONFIG } from "../src/handoff/handoff-controller.js";
import { CollectingJournalSink, Journal } from "../src/journal.js";
import { BrowserSession } from "../src/session/browser-session.js";
import { TmpSandboxFactory } from "../src/session/sandbox.js";
import { TimerWaiter } from "../src/session/waiter.js";
import { FIXTURE_DIR, FixedClock } from "./fakes.js";

export const LAUNCH_MS = 60_000;

/**
 * Real Chrome, real DOM, local `file://` fixtures — never a third-party site.
 * The suite skips (loudly, with the reason) when Chrome cannot start here:
 * a machine with no downloaded browser or no display is a missing capability,
 * not a failing guard.
 */
export async function probeChrome(id = "probe"): Promise<string | null> {
  // Unique per caller: two suites probing into one temp profile would delete
  // each other's directory and report a capability failure that is not one.
  const sandbox = new TmpSandboxFactory().create(`${id}-${process.pid}`);
  try {
    const browser = await new PuppeteerLauncher().launch({
      userDataDir: sandbox.path,
      downloadDir: sandbox.downloadDir,
      surface: "native-window",
      windowWidth: 900,
      windowHeight: 700,
    });
    await browser.close();
    return null;
  } catch (error) {
    return String(error).slice(0, 300);
  } finally {
    sandbox.dispose();
  }
}

export function buildSession(sessionId = "chrome_fixture"): BrowserSession {
  return new BrowserSession({
    launcher: new PuppeteerLauncher(),
    sandboxes: new TmpSandboxFactory(),
    classifier: new FieldClassifier(),
    policy: new NavigationPolicy({
      fileRoots: [FIXTURE_DIR],
      allowHosts: [],
      denyHosts: [],
    }),
    inspector: new CartInspector(),
    covenant: new CartCovenant({ capPaise: 150_000, currency: "INR" }),
    journal: new Journal(
      new CollectingJournalSink(),
      new FixedClock(),
      "sess_chrome",
    ),
    waiter: new TimerWaiter(),
    clock: new FixedClock(),
    config: {
      sessionId,
      surface: "native-window",
      windowWidth: 1100,
      windowHeight: 800,
      handoff: { ...DEFAULT_HANDOFF_CONFIG, pollIntervalMs: 50, maxPolls: 3 },
    },
  });
}
