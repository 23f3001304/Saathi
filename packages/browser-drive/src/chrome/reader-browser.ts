import type { Browser } from "puppeteer";
import { launch } from "puppeteer";

/**
 * Where a research batch's browser comes from.
 *
 * DECISION: a port rather than a flag on the reader, because the two surfaces
 * differ in more than an argument list — one launches Chrome on the user's own
 * machine, the other starts a container and ends it again — and the reader
 * should not know which it got. One `open` per batch and one `close` after it:
 * the container surface cannot be allowed to outlive the batch it was opened
 * for, and a single lifetime rule is worth more than a warm start.
 */
export interface ReaderBrowser {
  open(): Promise<Browser>;
  close(): Promise<void>;
}

/**
 * The flags the reader has always launched with. `--disable-gpu` because
 * nothing here paints, and images off at the engine because a research read
 * wants the document and never the pictures.
 */
export const NATIVE_READER_ARGS: readonly string[] = [
  "--disable-gpu",
  "--blink-settings=imagesEnabled=false",
];

/** Headless Chrome on this host: the reader's surface where the window's is. */
export class NativeReaderBrowser implements ReaderBrowser {
  private browser: Browser | null = null;

  async open(): Promise<Browser> {
    await this.close();
    this.browser = await launch({
      headless: true,
      args: [...NATIVE_READER_ARGS],
    });
    return this.browser;
  }

  async close(): Promise<void> {
    const held = this.browser;
    this.browser = null;
    await held?.close().catch(() => undefined);
  }
}

/**
 * A reader whose surface is not known yet.
 *
 * Which surface this host reads on is the answer to a Docker probe, and a probe
 * is a promise where boot is not. This holds the question open until the first
 * batch asks it, so the reader is still built once, at boot, beside everything
 * else — and still gets whatever the window got.
 */
export class DeferredReaderBrowser implements ReaderBrowser {
  private held: ReaderBrowser | null = null;

  constructor(private readonly choose: () => Promise<ReaderBrowser>) {}

  async open(): Promise<Browser> {
    await this.close();
    const chosen = await this.choose();
    this.held = chosen;
    return await chosen.open();
  }

  async close(): Promise<void> {
    const held = this.held;
    this.held = null;
    await held?.close().catch(() => undefined);
  }
}
