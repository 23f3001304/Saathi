import type { Logger } from "@covenant/domain";
import type { Browser } from "puppeteer";

import type { ReaderBrowser } from "../chrome/reader-browser.js";
import type { ConnectedBrowser } from "./container-launcher.js";
import { launchReaderContainer } from "./container-reader.js";
import type { ContainerReaderConfig } from "./container-reader.js";
import { WarmContainers, warmSessionId } from "./warm-pool.js";

/**
 * How long a reader container may sit unclaimed. Well inside the container's
 * own `timeout`, so a batch that claims one still gets a full lifetime rather
 * than the remainder of somebody else's.
 */
export const WARM_READER_MAX_AGE_MS = 300_000;

/**
 * Pre-started research containers.
 *
 * DECISION: this changes *when* a reader container is launched and nothing
 * else. `ContainerReaderBrowser` promised one container per batch, ended
 * however the batch ended, and a throwaway profile that dies with it. All three
 * still hold: the pool hands each container to exactly one batch and the batch
 * still closes it. What is gone is the wait - the container was started while
 * the model was still deciding what to read.
 */
export class WarmReaderBrowsers {
  private readonly pool: WarmContainers<ConnectedBrowser>;

  constructor(config: ContainerReaderConfig, size: number, logger?: Logger) {
    this.pool = new WarmContainers({
      size,
      maxAgeMs: WARM_READER_MAX_AGE_MS,
      start: () => launchReaderContainer(config, warmSessionId()),
      retire: (held) => held.close(),
      ...(logger === undefined ? {} : { logger }),
      label: "reader",
    });
  }

  /** Starts filling. Called at boot and after every batch. */
  prime(): void {
    this.pool.prime();
  }

  get ready(): number {
    return this.pool.ready;
  }

  /** One batch's surface. A new one per batch, exactly as before. */
  surface(): ReaderBrowser {
    return new PooledReaderBrowser(this.pool);
  }

  drain(): Promise<void> {
    return this.pool.drain();
  }
}

/**
 * The `ReaderBrowser` a batch is handed. It owns the container it claimed for
 * as long as the batch runs and ends it afterwards, which is the same contract
 * `ContainerReaderBrowser` has: the only browser it can possibly close is the
 * one this batch was given.
 */
class PooledReaderBrowser implements ReaderBrowser {
  private held: ConnectedBrowser | null = null;

  constructor(private readonly pool: WarmContainers<ConnectedBrowser>) {}

  async open(): Promise<Browser> {
    await this.close();
    const claimed = await this.pool.claim();
    this.held = claimed;
    return claimed.connection;
  }

  async close(): Promise<void> {
    const held = this.held;
    this.held = null;
    await held?.close().catch(() => undefined);
  }
}
