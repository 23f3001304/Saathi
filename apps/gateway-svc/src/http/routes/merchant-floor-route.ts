import type { MerchantItem } from "@covenant/domain";
import { parseSignatureHeader } from "@covenant/gateway";
import type { Hono } from "hono";

import type { CompositionRoot } from "../../composition-root.js";
import type { AppContext, AppEnv } from "../app-env.js";
import { signedBody } from "../middleware/acp-headers.js";
import type { AdmissionDeps } from "../middleware/acp-headers.js";
import { floorBody, floorSchema } from "./merchant-wire.js";
import { sendReason } from "./reply.js";

const ITEM_SCAN_LIMIT = 100;

/**
 * The merchant's discount authority, per listing.
 *
 * DECISION: a floor is a **route of its own**, not another field on the item
 * patch. Why: the price, the prose and the pointers are one listing edit, and
 * folding "how far an agent may discount this without asking me" into that
 * same save would let a merchant grant discount authority while meaning to fix
 * a typo. It is its own signed statement, with its own ledger event, and
 * clearing it is another.
 *
 * DECISION: it is **not** carried on a labelled line of the Razorpay
 * description, the way the product page and the image are. Why: that
 * description is merchant prose that reaches a buyer agent tagged
 * `untrusted_text` and lands in memory quarantined at P0 — which is exactly
 * what makes it safe to carry a *claim* there. A floor is not a claim; it is a
 * bound the gateway enforces against the merchant's own agent, and a bound
 * read out of free text is a bound whoever can write that text controls. It
 * lives in `sku_price_floors`, written only under a merchant signature.
 */
export function registerMerchantFloor(
  app: Hono<AppEnv>,
  root: CompositionRoot,
  admission: AdmissionDeps,
): void {
  app.put(
    "/v1/merchant/items/:id/floor",
    signedBody(admission, ["merchant"]),
    (context) => setFloor(context, root),
  );
}

async function setFloor(
  context: AppContext,
  root: CompositionRoot,
): Promise<Response> {
  const items = root.items;
  if (items === null) {
    return sendReason(context, root.clock, "RAZORPAY_UNAVAILABLE");
  }
  const parsed = floorSchema.safeParse(context.get("admitted").parsedBody);
  if (!parsed.success) {
    return sendReason(context, root.clock, "SCHEMA_VIOLATION");
  }
  const itemId = context.req.param("id") ?? "";
  const item = (await items.listItems(ITEM_SCAN_LIMIT)).find(
    (candidate) => candidate.itemId === itemId,
  );
  if (item === undefined) {
    return sendReason(context, root.clock, "SCHEMA_VIOLATION");
  }
  return apply(context, root, item, parsed.data.floor_paise);
}

function apply(
  context: AppContext,
  root: CompositionRoot,
  item: MerchantItem,
  floorPaise: number | null,
): Response {
  const outcome = root.services.floors.apply({
    tenantId: context.get("tenantId"),
    merchantId: merchantIdOf(root),
    skuId: item.itemId,
    floorPaise,
    listPaise: item.price.paise,
    currency: item.price.currency,
    declaredBy: kidOf(context),
    requestId: context.get("requestId"),
  });
  if (outcome.status === "rejected") {
    return sendReason(context, root.clock, outcome.reasonCode);
  }
  root.obs.logger.info("merchant.floor.written", {
    item_id: item.itemId,
    status: outcome.status,
  });
  return context.json(
    floorBody(
      item,
      root.stores.floors.find(context.get("tenantId"), item.itemId),
    ),
  );
}

/** The kid that signed the declaration, so the row names who granted it. */
function kidOf(context: AppContext): string {
  const raw = context.req.header("Signature") ?? null;
  return (raw === null ? null : parseSignatureHeader(raw)?.keyid) ?? "";
}

function merchantIdOf(root: CompositionRoot): string {
  const issuer = root.keys.keys.issuerFor("merchant") ?? "";
  return issuer.slice(issuer.lastIndexOf(":") + 1);
}
