import { randomBytes } from "node:crypto";
import type { Browser } from "puppeteer";

import type { ReaderBrowser } from "../chrome/reader-browser.js";
import type { LaunchRequest } from "../ports.js";
import { ContainerLauncher } from "./container-launcher.js";
import type { ConnectedBrowser } from "./container-launcher.js";
import { CONTAINER_DOWNLOAD_DIR, CONTAINER_PROFILE_DIR } from "./docker-args.js";

/** The launcher's config minus the session: a read brings its own, every time. */
export interface ContainerReaderConfig {
  readonly image: string;
  /** Host path to the seccomp profile Chrome's own sandbox needs. */
  readonly seccompProfile: string;
  readonly memoryMb: number;
  readonly ttlSeconds: number;
}

/**
 * The one flag the reader's container carries that the shopper's does not.
 * Blocking image *requests* is already done per page; this stops the engine
 * decoding anything that slips past, and it is the same flag the native reader
 * has always launched with.
 */
export const READER_CHROME_ARGS: readonly string[] = [
  "--blink-settings=imagesEnabled=false",
];

/**
 * Nobody watches this window, so the viewport is only wide enough that a shop's
 * desktop layout renders rather than its mobile one — a narrow frame changes
 * which tiles a page prints, and the reading with it.
 */
const READER_WINDOW = { width: 1280, height: 900 } as const;

/**
 * A session id for one batch and nothing else. `read_` says at a glance, in
 * `docker ps` and in the container's own label, that this is a research
 * container: it holds no profile, no sign-in and no shopper's window, and it is
 * gone before the next batch starts.
 */
export function readSessionId(): string {
  return `read_${randomBytes(6).toString("hex")}`;
}

/** The launch the reader asks for. Both paths inside the image, never a mount. */
export function readerLaunchRequest(): LaunchRequest {
  return {
    userDataDir: CONTAINER_PROFILE_DIR,
    downloadDir: CONTAINER_DOWNLOAD_DIR,
    surface: "container",
    windowWidth: READER_WINDOW.width,
    windowHeight: READER_WINDOW.height,
  };
}

/** One reader container, started. The pool and the plain surface below both
 *  go through here, so "what a research container is" is written once. */
export function launchReaderContainer(
  config: ContainerReaderConfig,
  sessionId: string = readSessionId(),
): Promise<ConnectedBrowser> {
  const launcher = new ContainerLauncher({
    ...config,
    sessionId,
    chromeArgs: READER_CHROME_ARGS,
  });
  return launcher.launch(readerLaunchRequest());
}

/**
 * Research reads in the same container the shopper's window would get: same
 * image, same seccomp profile, same lockdown, a throwaway profile on tmpfs that
 * dies with it. One container per batch, ended when the batch ends however it
 * ends — so choosing the container surface leaves no Chrome on this host for
 * any purpose, which is the whole claim the container makes.
 */
export class ContainerReaderBrowser implements ReaderBrowser {
  private held: ConnectedBrowser | null = null;

  constructor(private readonly config: ContainerReaderConfig) {}

  async open(): Promise<Browser> {
    await this.close();
    const launched = await launchReaderContainer(this.config);
    this.held = launched;
    return launched.connection;
  }

  async close(): Promise<void> {
    const held = this.held;
    this.held = null;
    await held?.close().catch(() => undefined);
  }
}
