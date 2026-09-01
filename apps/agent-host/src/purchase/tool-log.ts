import type {
  CatalogListing,
  IssuedQuote,
  MemoryWriteResponse,
} from "@covenant/agents";

export interface MemoryWriteRecord {
  readonly type: string;
  readonly tierClaim: string;
  readonly channel: string;
  readonly status: string;
  readonly memoryId: string | null;
  readonly tierGranted: string | null;
  readonly reasonCode: string | null;
  readonly rule: string | null;
  readonly eventId: string;
  readonly human: string | null;
}

/**
 * What the tools actually did, kept beside the transcript rather than inside
 * it. The conversation is the agent's *account* of the run; this is the run.
 * The purchase can only be assembled from what is recorded here, so a step the
 * model narrated but never took cannot reach the cart.
 */
export class ToolLog {
  private catalogListings: readonly CatalogListing[] = [];
  private issued: IssuedQuote | null = null;
  private readonly writes: MemoryWriteRecord[] = [];

  /**
   * A new run starts with an empty record.
   *
   * Without this the log was process-lifetime: `ensureQuote` found the first
   * quote this process ever issued still sitting there, bound *that* into the
   * cart, and the gateway — which resolves the signed quote from the memory
   * entries this cart named — could not find it. `CART_QUOTE_MISMATCH`, on a
   * cart whose total was right, for a quote from a conversation two turns ago.
   * The listings and the memory writes carried over the same way, so the run's
   * own account of itself included work it had not done.
   */
  reset(): void {
    this.catalogListings = [];
    this.issued = null;
    this.writes.length = 0;
  }

  recordListings(listings: readonly CatalogListing[]): void {
    this.catalogListings = listings;
  }

  recordQuote(quote: IssuedQuote): void {
    this.issued = quote;
  }

  recordWrite(args: {
    type: string;
    tierClaim: string;
    channel: string;
    body: MemoryWriteResponse;
  }): void {
    this.writes.push({
      type: args.type,
      tierClaim: args.tierClaim,
      channel: args.channel,
      status: args.body.status,
      memoryId: args.body.memory_id,
      tierGranted: args.body.tier_granted,
      reasonCode: args.body.reason_code,
      rule: args.body.rule,
      eventId: args.body.event_id,
      human: args.body.human,
    });
  }

  get listings(): readonly CatalogListing[] {
    return this.catalogListings;
  }

  get quote(): IssuedQuote | null {
    return this.issued;
  }

  get memoryWrites(): readonly MemoryWriteRecord[] {
    return this.writes;
  }

  get rejectedWrites(): readonly MemoryWriteRecord[] {
    return this.writes.filter((write) => write.status === "rejected");
  }
}
