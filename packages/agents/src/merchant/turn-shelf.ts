import type { MerchantCatalogSource } from "./catalog-source.js";
import type { CatalogSku } from "./demo-catalog.js";

/** The shelf as a reader sees it: whatever this turn's one read returned. */
export interface ShelfView {
  current(): readonly CatalogSku[];
}

export interface Shelf extends ShelfView {
  /** Begins a turn and performs its single read. Rejects rather than degrades. */
  open(): Promise<readonly CatalogSku[]>;
}

/**
 * One shelf, read once per turn, by everything in that turn.
 *
 * The drafter, the browse listing, the catalog tool and the quote tool used to
 * answer "what is on sale right now" separately — the first three from a frozen
 * fixture and the last from the live Razorpay shelf — so the agent named a SKU
 * the merchant had never heard of and the quote came back `null`. They now read
 * one snapshot, so the identifier a model picks is by construction an
 * identifier the quote can be built against.
 *
 * DECISION: the snapshot lives for one turn and no longer. Three tools hitting
 * Razorpay inside a single turn are three chances to disagree mid-purchase, and
 * a cache that outlives the turn is a listing the merchant retired still being
 * offered. `open()` is the turn boundary and it is the only thing that clears.
 *
 * DECISION: a failed read is not a shelf. It throws, and the turn fails with a
 * reason, rather than substituting the fixture — a demo catalog impersonating a
 * live read is indistinguishable, from the outside, from the merchant actually
 * stocking those things.
 */
export class TurnShelf implements Shelf, MerchantCatalogSource {
  private snapshot: readonly CatalogSku[] = [];

  private reading: Promise<readonly CatalogSku[]> | null = null;

  constructor(private readonly source: MerchantCatalogSource) {}

  open(): Promise<readonly CatalogSku[]> {
    this.snapshot = [];
    this.reading = null;
    return this.skus();
  }

  /**
   * One read per turn even when several tools ask at once: the in-flight
   * promise is shared, so concurrent callers get the same rows rather than
   * racing two reads of a shelf that may have changed between them.
   */
  async skus(): Promise<readonly CatalogSku[]> {
    this.reading ??= this.source.skus();
    try {
      this.snapshot = await this.reading;
    } catch (cause) {
      this.reading = null;
      throw cause;
    }
    return this.snapshot;
  }

  /** What `open()` read. Empty before the turn's read, never a fixture. */
  current(): readonly CatalogSku[] {
    return this.snapshot;
  }
}
