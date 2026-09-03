import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import type { Browser, Page } from "puppeteer";
import { connect } from "puppeteer";

import { PuppeteerPage } from "../chrome/puppeteer-page.js";
import type {
  BrowserLauncher,
  DrivenPage,
  LaunchedBrowser,
  LaunchRequest,
} from "../ports.js";
import { assertSurface } from "../surface.js";
import type { SessionSurface } from "../surface.js";
import { containerChromeArgs, containerRunArgs } from "./run-args.js";
import type { ContainerSpec } from "./run-args.js";
import { assertBound, specOf } from "./container-spec.js";
import type { ContainerLauncherConfig } from "./container-spec.js";
import {
  createNetwork,
  DockerUnavailableError,
  removeContainer,
  removeNetwork,
} from "./docker-cli.js";
import { ContainerPipe } from "./pipe-transport.js";

/** Chrome inside a cold container needs a moment before it answers CDP. */
const HANDSHAKE_TIMEOUT_MS = 45_000;
/** Enough of docker's own complaint to name the cause, never a whole log. */
const STDERR_KEPT = 600;

/**
 * One browser session, one container, reached over one pipe.
 *
 * DECISION: the container is addressed by a `ChildProcess`, never by a name or
 * a port. Nothing outside this object holds a handle to the window, so "a
 * session key for one errand cannot reach another errand's browser" is not a
 * check that has to run on every request — there is simply no address to send
 * one to. The label is still read back after start, because a name collision
 * with a leftover container is the one way the wrong window could arrive.
 */
export class ContainerLauncher implements BrowserLauncher {
  constructor(private readonly config: ContainerLauncherConfig) {}

  async launch(request: LaunchRequest): Promise<LaunchedBrowser> {
    assertSurface(request.surface, "container");
    const spec = specOf(this.config);
    // A leftover from a session that died badly is destroyed, never joined: a
    // network this process did not create is one it cannot vouch for.
    await removeContainer(spec.containerName);
    await removeNetwork(spec.networkName);
    await createNetwork(spec.networkName);
    try {
      return await this.start(spec, request);
    } catch (cause) {
      await removeContainer(spec.containerName);
      await removeNetwork(spec.networkName);
      throw cause;
    }
  }

  private async start(
    spec: ContainerSpec,
    request: LaunchRequest,
  ): Promise<LaunchedBrowser> {
    const args = containerRunArgs(spec, containerChromeArgs(request));
    const child = spawn("docker", [...args], {
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    const pipe = new ContainerPipe(child);
    const browser = await withTimeout(
      connect({ transport: pipe, protocolTimeout: PROTOCOL_TIMEOUT_MS }),
      child,
    );
    await assertBound(spec);
    const page = await firstPage(browser, request);
    const driven = await PuppeteerPage.open(page);
    return new ContainerBrowser(spec, child, browser, driven);
  }
}

/**
 * How long one CDP command may go unanswered.
 *
 * DECISION: set, rather than left at puppeteer's 180-second default. When a
 * container's renderer dies, commands aimed at it are sent down a pipe nobody
 * is reading and puppeteer simply waits — so a live errand spent minutes
 * inside single calls that were never going to be answered, and the shopper's
 * chat queued behind it. Comfortably above the 30-second navigation timeout,
 * so nothing legitimate is cut short; far below three minutes, so a dead
 * target is an error the errand can route around while the person is still
 * watching.
 */
const PROTOCOL_TIMEOUT_MS = 60_000;

/**
 * A container that never comes up fails as a timeout on the pipe, which on its
 * own says nothing useful. Docker's own complaint arrives on stderr, so it is
 * kept and handed back as the reason — the difference between "it hung" and
 * "the image is not built here".
 */
function withTimeout(
  pending: Promise<Browser>,
  child: ChildProcess,
): Promise<Browser> {
  let noise = "";
  child.stderr?.on("data", (chunk: Buffer) => {
    noise = `${noise}${chunk.toString("utf8")}`.slice(-STDERR_KEPT);
  });
  const failed = new Promise<never>((_resolve, reject) => {
    const fail = (why: string): void => {
      reject(new DockerUnavailableError(`${why}: ${noise.trim()}`));
    };
    const timer = setTimeout(() => {
      fail("Chrome in the container never answered on the pipe");
    }, HANDSHAKE_TIMEOUT_MS);
    timer.unref();
    child.once("close", (code) => {
      clearTimeout(timer);
      fail(`the container exited with code ${String(code)}`);
    });
  });
  return Promise.race([pending, failed]);
}

/**
 * Headless has no window to size, so the viewport is set explicitly. The frame
 * stream and every relayed coordinate are in these pixels, which is the reason
 * it is stated rather than inherited from a window that does not exist.
 */
async function firstPage(
  browser: Browser,
  request: LaunchRequest,
): Promise<Page> {
  const pages = await browser.pages();
  const page = pages[0] ?? (await browser.newPage());
  await page.setViewport({
    width: request.windowWidth,
    height: request.windowHeight,
  });
  const client = await page.createCDPSession();
  await client.send("Browser.setDownloadBehavior", { behavior: "deny" });
  await client.detach();
  return page;
}

class ContainerBrowser implements LaunchedBrowser {
  readonly surface: SessionSurface = "container";

  constructor(
    private readonly spec: ContainerSpec,
    private readonly child: ChildProcess,
    private readonly browser: Browser,
    private readonly driven: DrivenPage,
  ) {}

  get sandboxId(): string {
    return this.spec.containerName;
  }

  page(): DrivenPage {
    return this.driven;
  }

  /**
   * Belt and braces, in that order and on purpose. `Browser.close` asks Chrome
   * to exit, killing the child ends the `docker run` that `--rm` is attached
   * to, and `docker rm --force` is the one that does not depend on either
   * having worked. A container that survives its session is the whole failure.
   */
  async close(): Promise<void> {
    await this.browser.close().catch(() => undefined);
    this.child.kill();
    await removeContainer(this.spec.containerName);
    await removeNetwork(this.spec.networkName);
  }
}
