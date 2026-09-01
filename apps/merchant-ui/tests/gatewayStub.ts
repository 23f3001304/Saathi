// A stand-in for gateway-svc, in the shapes its routes actually answer.
//
// The console's own fixture floor is a product decision — what an unconfigured
// build shows — and is not a test double. This is the test double: it puts the
// suite on the *live* path, so the wire mapping, the `?merchant=` scoping and
// the LIVE labelling are all exercised rather than skipped.

const STANDING = {
  merchant_id: "kolam-run",
  score: 0.86,
  observations: 59,
  priorPseudoCount: 5,
  priorScore: 0.5,
  contributions: [
    { term: "quote_match", weight: 0.6, rate: 0.95, kept: 39, of: 41 },
    { term: "clean_channel", weight: 0.25, rate: 0.94, kept: 17, of: 18 },
  ],
  counters: {
    quotes_total: 41,
    quote_mismatches: 2,
    catalog_reads: 18,
    manipulation_attempts: 1,
    refunds_requested: 3,
    refunds_honored: 3,
    cooloff_cancellations: 4,
    carts_total: 44,
  },
  stock_conflicts: 2,
};

export const STUB_ITEM_ID = "item_TWO4GVGhCE5lwW";

const ITEMS = [
  {
    item_id: STUB_ITEM_ID,
    name: "Nilgiri handloom stole",
    description:
      "Only 2 left at 60% off.\n\nProduct page: https://kolam-run.example/nilgiri-stole\nProduct image: https://kolam-run.example/nilgiri-stole.jpg",
    amount_paise: 189900,
    currency: "INR",
    active: true,
    floor_paise: 170000,
    floor_list_paise: 189900,
  },
  {
    item_id: "item_TWNIHOyaam98x4",
    name: "Navy cotton kurta",
    description: "Handloom cotton in indigo.",
    amount_paise: 129900,
    currency: "INR",
    active: true,
    floor_paise: null,
    floor_list_paise: null,
  },
];

const SCARCITY = {
  kind: "scarcity",
  phrase: "Only 2 left",
  bias: "Loss aversion: a thing about to be unavailable feels more valuable.",
  counter: "Stock claims are untrusted text.",
};

function auditOf(copy: string): unknown {
  const cues = copy.toLowerCase().includes("only") ? [SCARCITY] : [];
  return {
    listings: [{ item_id: "draft", name: copy, cues }],
    by_kind: cues.length > 0 ? { scarcity: 1 } : {},
    clean: cues.length === 0 ? 1 : 0,
  };
}

const ROUTES: Record<string, unknown> = {
  "/v1/merchant/standing": {
    merchants: [STANDING],
    standing: STANDING,
    enrolled: [
      {
        issuer: "urn:covenant:merchant:kolam-run",
        kids: ["merchant-2026-08-479bb8bf"],
      },
    ],
    merchant_id: "kolam-run",
  },
  "/v1/merchant/items": { items: ITEMS },
  "/v1/merchant/listings/audit": {
    listings: [
      { item_id: STUB_ITEM_ID, name: ITEMS[0]?.name, cues: [SCARCITY] },
      { item_id: "item_TWNIHOyaam98x4", name: ITEMS[1]?.name, cues: [] },
    ],
    by_kind: { scarcity: 1 },
    clean: 1,
  },
  "/v1/merchant/demand": {
    merchant_id: "kolam-run",
    unmet: [
      {
        query: "linen shirt medium",
        asks: 7,
        last_at: "2026-08-30T18:20:00.000Z",
      },
    ],
    source_event: "catalog.read",
  },
  "/v1/merchant/negotiated": {
    merchant_id: "kolam-run",
    window_days: 7,
    settled: [
      {
        sku_id: STUB_ITEM_ID,
        carts: 4,
        cleared_floor: 4,
        saved_paise: 39600,
        floor_paise: 170000,
        list_paise: 189900,
        last_at: "2026-08-31T12:00:00.000Z",
      },
    ],
    source_event: "negotiation.settled",
  },
  "/v1/merchant/leakage": {
    merchant_id: "kolam-run",
    standing: STANDING,
    refusals: [{ reason_code: "QUOTE_EXPIRED", count: 5 }],
  },
  "/v1/transactions": {
    items: [
      {
        txn_id: "txn_stub_hold",
        state: "pending_cooloff",
        amount_paise: 189900,
        currency: "INR",
        merchant_id: "urn:covenant:merchant:kolam-run",
        cart_mandate_id: "urn:uuid:stub-hold",
        created_at: "2026-08-31T13:10:00.000Z",
        cooloff_until: "2126-08-31T13:40:00.000Z",
      },
      {
        txn_id: "txn_stub_paid",
        state: "captured",
        amount_paise: 129900,
        currency: "INR",
        merchant_id: "urn:covenant:merchant:kolam-run",
        cart_mandate_id: "urn:uuid:stub-paid",
        created_at: "2026-08-31T11:04:00.000Z",
        cooloff_until: null,
      },
      {
        txn_id: "txn_stub_other",
        state: "captured",
        amount_paise: 999900,
        currency: "INR",
        merchant_id: "urn:covenant:merchant:someone-else",
        cart_mandate_id: "urn:uuid:stub-other",
        created_at: "2026-08-31T10:00:00.000Z",
        cooloff_until: null,
      },
    ],
  },
};

/** A floor write answers with the item it was declared against, like a patch. */
function floorReply(url: URL): unknown | null {
  const found = /^\/v1\/merchant\/items\/([^/]+)\/floor$/.exec(url.pathname);
  const itemId = found?.[1];
  if (itemId === undefined) {
    return null;
  }
  return { item: ITEMS.find((item) => item.item_id === itemId) ?? ITEMS[0] };
}

function bodyFor(url: URL): unknown | null {
  if (url.pathname === "/v1/merchant/listings/draft-audit") {
    return auditOf(
      `${url.searchParams.get("name") ?? ""} ${url.searchParams.get("description") ?? ""}`,
    );
  }
  return ROUTES[url.pathname] ?? floorReply(url);
}

/** Replaces `fetch` for the whole suite, so no test can reach a real server. */
export function installGatewayStub(): void {
  globalThis.fetch = ((input: RequestInfo | URL) => {
    const url = new URL(typeof input === "string" ? input : input.toString());
    const body = bodyFor(url);
    if (body === null) {
      return Promise.resolve(new Response("{}", { status: 404 }));
    }
    return Promise.resolve(
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
  }) as typeof fetch;
}
