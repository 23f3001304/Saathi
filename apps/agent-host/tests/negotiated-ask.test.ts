import type {
  CatalogSku,
  IssuedQuote,
  PreToolUseHook,
  ToolCall,
  ToolDispatcher,
  ToolOutcome,
} from "@covenant/agents";
import { QUOTE_TOOL_NAME } from "@covenant/agents";
import { describe, expect, it } from "vitest";

import { MerchantToolFallback } from "../src/purchase/tool-fallback.js";
import { ToolLog } from "../src/purchase/tool-log.js";

const STOLE: CatalogSku = {
  sku: "item_TWO4GVGhCE5lwW",
  label: "Nilgiri handloom stole",
  category: "apparel",
  listPricePaise: 189900,
  currency: "INR",
  floorPricePaise: 170000,
  refundable: false,
  stock: 4,
  description: "Handwoven in the Nilgiris.",
  imageUrl: null,
};

const ALLOW = {
  evaluate: () => ({ allowed: true, reason: "", human: null }),
} as unknown as PreToolUseHook;

const SILENT = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

class RecordingDispatcher implements ToolDispatcher {
  readonly calls: ToolCall[] = [];

  dispatch(call: ToolCall): Promise<ToolOutcome> {
    this.calls.push(call);
    return Promise.resolve({ content: "{}", isError: false });
  }
}

function quoteFor(sku: CatalogSku): IssuedQuote {
  return {
    jws: "ey.quote",
    claims: { sku_id: sku.sku } as unknown as IssuedQuote["claims"],
    ref: {} as IssuedQuote["ref"],
  };
}

/**
 * The dispatcher here records rather than answers, so `ensureQuote` ends in
 * `PurchaseFailed` — deliberately. What is under test is the request it made
 * on the way there: what it asked for, and that it asked once.
 */
async function quoteCalls(
  sku: CatalogSku,
  capPaise: number,
): Promise<readonly ToolCall[]> {
  const dispatcher = new RecordingDispatcher();
  const fallback = new MerchantToolFallback(
    ALLOW,
    dispatcher,
    new ToolLog(),
    SILENT,
  );
  await fallback.ensureQuote(sku, capPaise).catch(() => undefined);
  return dispatcher.calls.filter((call) => call.tool === QUOTE_TOOL_NAME);
}

async function targetFor(
  sku: CatalogSku,
  capPaise: number,
): Promise<number | null> {
  const calls = await quoteCalls(sku, capPaise);
  return (calls[0]?.args["target_unit_paise"] as number | null) ?? null;
}

describe("the buyer's agent asks once, or not at all", () => {
  it("asks for nothing when the listed price already clears the ceiling", async () => {
    expect(await targetFor(STOLE, 200000)).toBeNull();
  });

  it("asks for exactly what the ceiling needs, not for the whole band", async () => {
    expect(await targetFor(STOLE, 180000)).toBe(180000);
  });

  it("asks for the floor only when the ceiling is that low", async () => {
    expect(await targetFor(STOLE, 170000)).toBe(170000);
  });

  it("asks for nothing when even the floor cannot reach the ceiling", async () => {
    expect(await targetFor(STOLE, 160000)).toBeNull();
  });

  it("asks for nothing where the merchant declared no discount authority", async () => {
    const noBand = { ...STOLE, floorPricePaise: STOLE.listPricePaise };

    expect(await targetFor(noBand, 180000)).toBeNull();
  });
});

describe("one ask, never a haggling loop", () => {
  it("makes exactly one quote request, at every point in the band", async () => {
    expect(await quoteCalls(STOLE, 200000)).toHaveLength(1);
    expect(await quoteCalls(STOLE, 180000)).toHaveLength(1);
    expect(await quoteCalls(STOLE, 160000)).toHaveLength(1);
  });

  it("does not re-quote a SKU the log already has a quote for", async () => {
    const dispatcher = new RecordingDispatcher();
    const log = new ToolLog();
    log.recordQuote(quoteFor(STOLE));
    const fallback = new MerchantToolFallback(ALLOW, dispatcher, log, SILENT);

    await fallback.ensureQuote(STOLE, 180000);

    expect(dispatcher.calls.filter((c) => c.tool === QUOTE_TOOL_NAME)).toEqual(
      [],
    );
  });
});
