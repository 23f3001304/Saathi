import { existsSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { CartCovenant } from "../src/cart/cart-covenant.js";
import { CartInspector } from "../src/cart/cart-inspector.js";
import { PuppeteerLauncher } from "../src/chrome/puppeteer-launcher.js";
import { NavigationPolicy } from "../src/drive/navigation-policy.js";
import { FieldClassifier } from "../src/field/field-classifier.js";
import { DEFAULT_HANDOFF_CONFIG } from "../src/handoff/handoff-controller.js";
import { CollectingJournalSink, Journal } from "../src/journal.js";
import type {
  BrowserLauncher,
  DrivenPage,
  LaunchedBrowser,
  LaunchRequest,
} from "../src/ports.js";
import { BrowserSession } from "../src/session/browser-session.js";
import { TmpSandboxFactory } from "../src/session/sandbox.js";
import { TimerWaiter } from "../src/session/waiter.js";
import type { DemoContext } from "./demo-steps.js";
import {
  browse,
  finalReview,
  provokeLoginBlock,
  provokePaymentBlock,
  proveFrozen,
  readCart,
  say,
  step,
  suggestResume,
  userSignsIn,
} from "./demo-steps.js";

const CAP_PAISE = 150_000;

/**
 * Walks up for the fixture shop so the demo runs the same from `scripts/` and
 * from `dist/scripts/`. It has to run compiled: the codebase uses constructor
 * parameter properties throughout, which Node's strip-only TypeScript mode
 * cannot parse.
 */
function fixturesDir(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let depth = 0; depth < 5; depth += 1) {
    const candidate = resolve(dir, "fixtures", "shop");
    if (existsSync(candidate)) {
      return candidate;
    }
    dir = dirname(dir);
  }
  throw new Error("fixture shop not found next to the demo script");
}

const FIXTURES = fixturesDir();
const page = (name: string): string => pathToFileURL(join(FIXTURES, name)).href;

/** Keeps a handle on the raw page so the demo can play the user's part. */
class CapturingLauncher implements BrowserLauncher {
  driven: DrivenPage | null = null;

  constructor(private readonly inner: BrowserLauncher) {}

  async launch(request: LaunchRequest): Promise<LaunchedBrowser> {
    const browser = await this.inner.launch(request);
    this.driven = browser.page();
    return browser;
  }
}

function build(launcher: BrowserLauncher, journal: Journal): BrowserSession {
  const clock = { now: () => new Date() };
  return new BrowserSession({
    launcher,
    sandboxes: new TmpSandboxFactory(),
    classifier: new FieldClassifier(),
    policy: new NavigationPolicy({
      fileRoots: [FIXTURES],
      allowHosts: [],
      denyHosts: [],
    }),
    inspector: new CartInspector(),
    covenant: new CartCovenant({ capPaise: CAP_PAISE, currency: "INR" }),
    journal,
    waiter: new TimerWaiter(),
    clock,
    config: {
      sessionId: "demo",
      surface: "native-window",
      windowWidth: 1180,
      windowHeight: 860,
      handoff: { ...DEFAULT_HANDOFF_CONFIG, pollIntervalMs: 400, maxPolls: 10 },
    },
  });
}

function printJournal(sink: CollectingJournalSink): string {
  const lines = sink.all();
  for (const line of lines) {
    say(line);
  }
  const path = join(tmpdir(), "covenant-browser-drive-demo.jsonl");
  writeFileSync(path, `${lines.join("\n")}\n`, "utf8");
  return path;
}

/**
 * `COVENANT_DEMO_HOLD_MS` — keep the window open at the end so a viewer can
 * look at the page the agent refused to act on, instead of it vanishing.
 */
async function holdOpen(): Promise<void> {
  const raw = Number(process.env["COVENANT_DEMO_HOLD_MS"] ?? "0");
  if (!Number.isFinite(raw) || raw <= 0) {
    return;
  }
  const ms = Math.min(raw, 300_000);
  say(`
  (window held open for ${Math.round(ms / 1000)}s — look at it)`);
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function run(): Promise<void> {
  const sink = new CollectingJournalSink();
  const journal = new Journal(sink, { now: () => new Date() }, "sess_demo");
  const launcher = new CapturingLauncher(new PuppeteerLauncher());
  const session = build(launcher, journal);
  say(
    "Covenant browser-drive demo — local fixture shop, visible Chrome, no live sites.",
  );
  const guarded = await session.launch();
  const hands = launcher.driven;
  if (hands === null) {
    throw new Error("the launcher did not expose a page");
  }
  const ctx: DemoContext = {
    session,
    page: guarded,
    hands,
    waiter: new TimerWaiter(),
  };
  try {
    await walk(ctx);
    await holdOpen();
  } finally {
    await session.close();
  }
  await step(9, "The journal (JSONL, append-only)");
  say(`\nWritten to ${printJournal(sink)}`);
}

async function walk(ctx: DemoContext): Promise<void> {
  await step(1, "Browse the shop under the guard");
  await browse(ctx, page("index.html"), page("product.html"));
  await step(2, "Read the cart heuristically");
  await readCart(ctx, page("cart.html"));
  await step(3, "The agent tries to type a password — the harness refuses");
  await provokeLoginBlock(ctx, page("login.html"));
  await step(4, "While the user drives, every agent page action throws");
  await proveFrozen(ctx);
  await step(5, "The user signs in themselves");
  await userSignsIn(ctx);
  await step(6, "Readiness is suggested, never acted on");
  await suggestResume(ctx);
  await step(7, "Card fields and payment buttons are refused too");
  await provokePaymentBlock(ctx, page("checkout.html"));
  await step(
    8,
    "Final review: the cart is over the cap, so the agent stops assisting",
  );
  await finalReview(ctx, CAP_PAISE);
}

await run();
