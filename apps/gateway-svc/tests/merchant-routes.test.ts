import { readFileSync } from "node:fs";
import { join } from "node:path";

import { Money } from "@covenant/domain";
import type { TrustRing } from "@covenant/mandates";
import { parseTrustRing } from "@covenant/mandates";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { onboardMerchant } from "../src/merchant/onboarding.js";
import type { Harness } from "./support/flow.js";
import { boot, teardown } from "./support/flow.js";

let harness: Harness;

function bootRing(): TrustRing {
  return parseTrustRing(
    JSON.parse(
      readFileSync(join(harness.dir, "keys", "trust-ring.json"), "utf8"),
    ) as unknown,
  );
}

interface StandingBody {
  merchants: { merchant_id: string; score: number }[];
  standing: { merchant_id: string; score: number };
  enrolled: { issuer: string; kids: string[] }[];
  merchant_id: string;
}

interface AuditBody {
  listings: { item_id: string; cues: { kind: string; phrase: string }[] }[];
  by_kind: Record<string, number>;
  clean: number;
}

const NEW_ITEM = {
  name: "Nilgiri handloom stole",
  description: "Cotton-silk, 2.2 m",
  amount_paise: 189900,
  currency: "INR",
};

beforeAll(async () => {
  harness = await boot();
}, 60_000);

afterAll(async () => {
  await teardown(harness);
});

describe("GET /v1/merchant/standing", () => {
  it("names the merchants this boot pinned, with the kid each signs under", async () => {
    const response = await harness.client.get("/v1/merchant/standing");
    const body = (await response.json()) as StandingBody;

    expect(response.status).toBe(200);
    expect(body.enrolled).toHaveLength(1);
    expect(body.enrolled[0]?.issuer).toContain("urn:covenant:merchant:");
    expect(body.enrolled[0]?.kids[0]).toMatch(/^merchant-/);
  });

  it("answers for the merchant the caller asked about, by slug", async () => {
    const response = await harness.client.get(
      "/v1/merchant/standing?merchant=nilgiri-weaves",
    );
    const body = (await response.json()) as StandingBody;

    expect(body.merchant_id).toBe("nilgiri-weaves");
    expect(body.standing.merchant_id).toBe("nilgiri-weaves");
  });

  it("treats a merchant with no history as the prior, not as a 404", async () => {
    const response = await harness.client.get(
      "/v1/merchant/standing?merchant=nobody-at-all",
    );
    const body = (await response.json()) as StandingBody;

    expect(response.status).toBe(200);
    expect(body.standing.merchant_id).toBe("nobody-at-all");
  });
});

describe("GET /v1/merchant/listings/draft-audit", () => {
  it("reads copy that is not an item yet with the buyer's own detector", async () => {
    const response = await harness.client.get(
      "/v1/merchant/listings/draft-audit?name=Stole&description=Only%202%20left%20at%2060%25%20off",
    );
    const body = (await response.json()) as AuditBody;

    expect(response.status).toBe(200);
    expect(body.listings[0]?.cues.map((cue) => cue.kind)).toContain("scarcity");
  });

  it("finds nothing in copy that is merely a description", async () => {
    const response = await harness.client.get(
      "/v1/merchant/listings/draft-audit?name=Stole&description=Cotton-silk%2C%202.2%20m",
    );
    const body = (await response.json()) as AuditBody;

    expect(body.clean).toBe(1);
    expect(body.listings[0]?.cues).toEqual([]);
  });
});

describe("GET /v1/merchant/items with no Razorpay key", () => {
  it("says unavailable rather than serving an empty shop as if it were one", async () => {
    const response = await harness.client.get("/v1/merchant/items");
    const body = (await response.json()) as { error: { reason_code: string } };

    expect(response.status).toBe(503);
    expect(body.error.reason_code).toBe("RAZORPAY_UNAVAILABLE");
  });
});

describe("writing inventory", () => {
  it("refuses an unsigned create", async () => {
    const response = await fetch(`${harness.running.url}/v1/merchant/items`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(NEW_ITEM),
    });

    expect(response.status).toBeGreaterThanOrEqual(400);
  });

  it("refuses a create signed with the user key rather than the merchant key", async () => {
    const response = await harness.client.post("/v1/merchant/items", NEW_ITEM, {
      role: "user",
    });

    expect(response.status).toBeGreaterThanOrEqual(400);
  });
});

describe("onboarding a second merchant", () => {
  it("enrols an issuer and a kid into the ring the gateway will next load", async () => {
    const ring = bootRing();

    const onboarded = await onboardMerchant(
      ring,
      { slug: "nilgiri-weaves", displayName: "Nilgiri Weaves", items: [] },
      null,
      new Date(),
    );

    expect(onboarded.issuer).toBe("urn:covenant:merchant:nilgiri-weaves");
    expect(onboarded.ring.issuers[onboarded.issuer]?.kids).toEqual([
      onboarded.kid,
    ]);
    expect(onboarded.ring.keys.length).toBe(ring.keys.length + 1);
  });

  it("creates nothing at Razorpay when there is no item catalog to create it in", async () => {
    const onboarded = await onboardMerchant(
      bootRing(),
      {
        slug: "nilgiri-weaves",
        displayName: "Nilgiri Weaves",
        items: [
          {
            name: NEW_ITEM.name,
            description: NEW_ITEM.description,
            price: Money.fromPaise(NEW_ITEM.amount_paise, NEW_ITEM.currency),
          },
        ],
      },
      null,
      new Date(),
    );

    expect(onboarded.items).toEqual([]);
  });
});
