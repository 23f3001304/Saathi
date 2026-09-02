// The two writes a merchant makes: add an item, change one. Both carry a
// merchant ES256 signature over the canonical base string, because inventory
// is the merchant's to change and the trust ring is the only thing that says
// who the merchant is.
import { API_VERSION, gatewayBaseUrl } from "./gateway.ts";
import { signatureHeader } from "./merchantKey.ts";
import { itemOf } from "./merchantApi.ts";
import type { MerchantItemView } from "./merchantTypes.ts";

export type ItemDraft = {
  name: string;
  description: string;
  amountPaise: number;
  currency: string;
};

export type ItemPatch = {
  name: string | null;
  description: string | null;
  amountPaise: number | null;
  currency: string | null;
  active: boolean | null;
};

function base(): string {
  const url = gatewayBaseUrl();
  if (url === null) {
    throw new Error(
      "This build is running on fixtures, so there is no shop to write to.",
    );
  }
  return url;
}

async function send(
  method: "POST" | "PATCH" | "PUT",
  path: string,
  body: unknown,
): Promise<MerchantItemView> {
  const canonicalPath = decodeURIComponent(path);
  const rawBody = JSON.stringify(body);
  const timestamp = new Date().toISOString();
  const idempotencyKey = crypto.randomUUID();
  const response = await fetch(`${base()}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      "Request-Id": crypto.randomUUID(),
      "API-Version": API_VERSION,
      "Idempotency-Key": idempotencyKey,
      Timestamp: timestamp,
      Signature: await signatureHeader({
        // Signed over the DECODED path: the gateway verifies against Hono's
        // c.req.path, which arrives decoded, so signing the wire-encoded
        // form ("urn%3Aitem%3A...") failed every id with a colon in it.
        method,
        path: canonicalPath,
        timestamp,
        idempotencyKey,
        rawBody,
      }),
    },
    body: rawBody,
  });
  return readItem(response);
}

async function readItem(response: Response): Promise<MerchantItemView> {
  const payload = (await response.json().catch(() => null)) as {
    item?: Parameters<typeof itemOf>[0];
    error?: { human?: string; reason_code?: string };
  } | null;
  if (!response.ok || payload?.item === undefined) {
    throw new Error(
      payload?.error?.human ??
        `That did not save (${response.status.toString()}).`,
    );
  }
  return itemOf(payload.item);
}

export function createItem(draft: ItemDraft): Promise<MerchantItemView> {
  return send("POST", "/v1/merchant/items", {
    name: draft.name,
    description: draft.description,
    amount_paise: draft.amountPaise,
    currency: draft.currency,
  });
}

export function updateItem(
  itemId: string,
  patch: ItemPatch,
): Promise<MerchantItemView> {
  return send("PATCH", `/v1/merchant/items/${encodeURIComponent(itemId)}`, {
    name: patch.name,
    description: patch.description,
    amount_paise: patch.amountPaise,
    currency: patch.currency,
    active: patch.active,
  });
}

/**
 * The discount authority, as its own signed statement. `null` withdraws it.
 *
 * Separate from the listing save on purpose: a price and a floor are two
 * different promises, and one signature that carried both would let a
 * shopkeeper grant an agent room to discount while meaning to fix a typo.
 */
export function setFloor(
  itemId: string,
  floorPaise: number | null,
): Promise<MerchantItemView> {
  return send("PUT", `/v1/merchant/items/${encodeURIComponent(itemId)}/floor`, {
    floor_paise: floorPaise,
  });
}
