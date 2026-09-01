import type { Clock, IdGenerator, Logger } from "@covenant/domain";
import type { MerchantCatalogSource } from "@covenant/agents";
import {
  AgentInstance,
  CatalogTool,
  DEFAULT_ENVELOPE_SIGNER_CONFIG,
  DEMO_CATALOG,
  DEMO_MERCHANT_ID,
  FixtureCatalogSource,
  GatewayItemReader,
  LiveCatalogSource,
  MERCHANT_TOOL_SERVER,
  MerchantAgent,
  QuoteTool,
  ToolEnvelopeSigner,
  ToolEnvelopeVerifier,
  TurnShelf,
  envelopeVerifierConfig,
} from "@covenant/agents";

import type { AgentHostConfig } from "../config.js";
import type { KeyParts } from "./key-wiring.js";

/** Long enough that a demo quote outlives the conversation that asked for it. */
const QUOTE_TTL_SECONDS = 3600;

/** Re-quotes per SKU per process; a merchant farmed forever is a merchant. */
const MAX_QUOTES_PER_SKU = 4;

/** No TTL: `TurnShelf` is the cache, and the turn is how long it may live. */
const LIVE_CATALOG = { limit: 50, ttlSeconds: 0 } as const;

export interface MerchantParts {
  readonly agent: MerchantAgent;
  /**
   * The one shelf. Everything that asks what this merchant sells — the tools,
   * the drafter, the browse listing and the planner's probe — reads this same
   * per-turn snapshot. It used to be two: a frozen `catalog` for the harness
   * and a live `source` for the tools, which is how the agent came to name a
   * fixture SKU at a merchant that had never stocked one.
   */
  readonly shelf: TurnShelf;
  readonly merchantId: string;
  readonly server: string;
}

export interface BuyerIdentityParts {
  readonly instance: AgentInstance;
  readonly envelopes: ToolEnvelopeSigner;
}

/**
 * The buyer's AM2 identity: one instance id per process, minted once and bound
 * into every mandate and every tool envelope (A.3). Minting it per call would
 * let two calls inside one session disown each other, which is exactly the
 * correlation the audit trail is built on.
 */
export function wireBuyerIdentity(
  keys: KeyParts,
  clock: Clock,
  ids: IdGenerator,
): BuyerIdentityParts {
  const instance = new AgentInstance("buyer", keys.userIss, ids);
  return {
    instance,
    envelopes: new ToolEnvelopeSigner(
      keys.buyerSigner,
      clock,
      ids,
      instance,
      DEFAULT_ENVELOPE_SIGNER_CONFIG,
    ),
  };
}

/**
 * The merchant agent over whichever shelf this mode has — the merchant's live
 * Razorpay items, or offline the frozen demo catalog, including the T-1
 * poisoned SKU and the scarcity SKU, which are fixtures the buyer must survive
 * rather than fixtures the buyer is protected from.
 *
 * Its envelope verifier is pinned to `covenant_merchant` and to the **user**
 * caller role: a quote request that arrives without the buyer's signature over
 * `{tool, server, args_hash}` is refused before a price is ever computed.
 */
export function wireMerchant(
  config: AgentHostConfig,
  keys: KeyParts,
  clock: Clock,
  ids: IdGenerator,
  logger: Logger,
): MerchantParts {
  const verifier = new ToolEnvelopeVerifier(
    keys.verifier,
    clock,
    envelopeVerifierConfig(MERCHANT_TOOL_SERVER, "user"),
  );
  const shelf = new TurnShelf(catalogSourceOf(config, clock, ids, logger));
  return {
    shelf,
    merchantId: DEMO_MERCHANT_ID,
    server: MERCHANT_TOOL_SERVER,
    agent: new MerchantAgent(
      new CatalogTool(shelf, verifier, DEMO_MERCHANT_ID),
      new QuoteTool(shelf, keys.merchantSigner, clock, ids, {
        merchantIss: keys.merchantIss,
        merchantId: DEMO_MERCHANT_ID,
        ttlSeconds: QUOTE_TTL_SECONDS,
      }),
      verifier,
      logger,
      { server: MERCHANT_TOOL_SERVER, maxQuotesPerSku: MAX_QUOTES_PER_SKU },
    ),
  };
}

/**
 * `scripted` — the default, and what a judge cloning this repo with no
 * credentials gets — is the frozen shelf, so the offline demo is
 * byte-identical run to run and the whole system still runs without a key.
 * `live` reads the merchant's real items through the gateway and, when that
 * read fails, fails: there is no third mode where demo data arrives dressed as
 * a live shelf.
 */
function catalogSourceOf(
  config: AgentHostConfig,
  clock: Clock,
  ids: IdGenerator,
  logger: Logger,
): MerchantCatalogSource {
  if (config.mode === "scripted") {
    return new FixtureCatalogSource(DEMO_CATALOG);
  }
  const reader = new GatewayItemReader(fetch, ids, {
    baseUrl: config.gatewayUrl,
    apiVersion: config.apiVersion,
    timeoutMs: config.timeoutMs,
  });
  return new LiveCatalogSource(reader, clock, logger, LIVE_CATALOG);
}
