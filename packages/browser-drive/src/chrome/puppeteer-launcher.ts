import type { Browser, Page } from "puppeteer";
import { launch } from "puppeteer";

import type {
  BrowserLauncher,
  DrivenPage,
  LaunchedBrowser,
  LaunchRequest,
} from "../ports.js";
import { assertSurface } from "../surface.js";
import type { SessionSurface } from "../surface.js";
import { assertSandboxIntact, sandboxArgs } from "./launch-args.js";
import { writeSessionPreferences } from "./profile-preferences.js";
import { PuppeteerPage } from "./puppeteer-page.js";

/** `COVENANT_DEMO_PACE_MS` — per-action delay so a human can follow along. */
function demoPaceMs(): number {
  const raw = Number(process.env["COVENANT_DEMO_PACE_MS"] ?? "0");
  return Number.isFinite(raw) && raw > 0 ? Math.min(raw, 2000) : 0;
}

export class ChromeLaunchError extends Error {
  constructor(readonly reason: unknown) {
    super(
      `Chrome would not start with its sandbox intact: ${String(reason)}\n` +
        "This package will not retry with --no-sandbox. Fix the environment (kernel user namespaces on Linux, or run outside a privileged container) rather than removing the boundary that keeps a hostile page away from the user's machine.",
    );
    this.name = "ChromeLaunchError";
  }
}

/**
 * Launches real, visible Chrome in a disposable sandbox.
 *
 * DECISION: there is no fallback path. When Chrome refuses to start, the usual
 * fix is `--no-sandbox`, which turns a renderer compromise on a hostile
 * checkout page into code running as the user — precisely the risk a *visible,
 * disposable* browser exists to bound. So this fails loudly instead, and says
 * what to fix. `headless` is not a parameter either: the port types it `false`,
 * because a purchase session the user cannot watch is the failure this whole
 * package is arranged to prevent.
 */
export class PuppeteerLauncher implements BrowserLauncher {
  async launch(request: LaunchRequest): Promise<LaunchedBrowser> {
    assertSurface(request.surface, "native-window");
    const args = sandboxArgs(request);
    assertSandboxIntact(args);
    writeSessionPreferences(request.userDataDir, request.downloadDir);
    const browser = await this.start(request, args);
    const page = await firstPage(browser);
    await denyDownloads(page);
    return new PuppeteerBrowser(browser, new PuppeteerPage(page));
  }

  private async start(
    request: LaunchRequest,
    args: readonly string[],
  ): Promise<Browser> {
    try {
      return await launch({
        headless: false,
        // Watchable pacing for a demo or a recording. Off by default: a real
        // run should be as fast as the site allows, not theatrically slow.
        slowMo: demoPaceMs(),
        userDataDir: request.userDataDir,
        defaultViewport: null,
        enableExtensions: false,
        // A pipe, not a WebSocket: no debugging port is opened on any
        // interface, so there is nothing on localhost for another process to
        // attach to and drive this browser.
        pipe: true,
        args: [...args],
      });
    } catch (cause) {
      throw new ChromeLaunchError(cause);
    }
  }
}

class PuppeteerBrowser implements LaunchedBrowser {
  readonly surface: SessionSurface = "native-window";
  /** There is no container; the window is a process on the user's own desktop. */
  readonly sandboxId = "in-process";

  constructor(
    private readonly browser: Browser,
    private readonly driven: DrivenPage,
  ) {}

  page(): DrivenPage {
    return this.driven;
  }

  async close(): Promise<void> {
    await this.browser.close();
  }
}

/** Nothing in a purchase flow needs to write a file to the user's machine. */
async function denyDownloads(page: Page): Promise<void> {
  const client = await page.createCDPSession();
  await client.send("Browser.setDownloadBehavior", { behavior: "deny" });
  await client.detach();
}

async function firstPage(browser: Browser): Promise<Page> {
  const pages = await browser.pages();
  const page = pages[0] ?? (await browser.newPage());
  await page.bringToFront();
  return page;
}
