import type { ItemCatalog } from "@covenant/domain";
import type { Hono } from "hono";

import type { CompositionRoot } from "../../composition-root.js";
import type { AppContext, AppEnv } from "../app-env.js";
import { readHeaders, signedBody } from "../middleware/acp-headers.js";
import { registerMerchantFloor } from "./merchant-floor-route.js";
import {
  itemPatchSchema,
  itemWire,
  newItemSchema,
  toItemPatch,
  toNewItem,
} from "./merchant-wire.js";
import { positiveInt, sendReason } from "./reply.js";

const DEFAULT_LIMIT = 50;

const MAX_LIMIT = 100;

/**
 * The merchant's inventory: their live Razorpay items, and the two writes that
 * change them.
 *
 * The read presents the two ACP headers, like every other projection. The
 * writes demand a **merchant-signed** ACP request: inventory is the
 * merchant's to change and nobody else's, and the pinned trust ring is the
 * only thing that says who the merchant is. There is deliberately no
 * onboarding route — see `src/merchant/onboarding.ts` for why a trust-ring key
 * cannot be minted over HTTP.
 */
export function registerMerchant(
  app: Hono<AppEnv>,
  root: CompositionRoot,
): void {
  const admission = {
    config: root.config,
    clock: root.clock,
    gate: root.keys.admission,
    keys: root.keys.keys,
  };
  const signed = signedBody(admission, ["merchant"]);

  app.get("/v1/merchant/items", readHeaders(admission), (context) =>
    listItems(context, root),
  );

  app.post("/v1/merchant/items", signed, (context) =>
    createItem(context, root),
  );

  app.patch("/v1/merchant/items/:id", signed, (context) =>
    patchItem(context, root),
  );

  registerMerchantFloor(app, root, admission);
}

/**
 * `503` rather than an empty list when no Razorpay key is configured: an empty
 * shelf and an unconfigured one are different facts, and the agent's catalog
 * source falls back to its fixture floor on the failure rather than telling a
 * buyer the shop is bare.
 */
async function listItems(
  context: AppContext,
  root: CompositionRoot,
): Promise<Response> {
  const items = root.items;
  if (items === null) {
    return sendReason(context, root.clock, "RAZORPAY_UNAVAILABLE");
  }
  const limit = positiveInt(
    context.req.query("limit"),
    DEFAULT_LIMIT,
    MAX_LIMIT,
  );
  const live = await items.listItems(limit);
  const tenantId = context.get("tenantId");
  return context.json({
    source: "razorpay_items",
    items: live.map((item) =>
      itemWire(item, root.stores.floors.find(tenantId, item.itemId)),
    ),
  });
}

async function createItem(
  context: AppContext,
  root: CompositionRoot,
): Promise<Response> {
  const items = root.items;
  if (items === null) {
    return sendReason(context, root.clock, "RAZORPAY_UNAVAILABLE");
  }
  const parsed = newItemSchema.safeParse(context.get("admitted").parsedBody);
  if (!parsed.success) {
    return sendReason(context, root.clock, "SCHEMA_VIOLATION");
  }
  const created = await items.createItem(toNewItem(parsed.data));
  root.obs.logger.info("merchant.item.created", { item_id: created.itemId });
  return context.json({ item: itemWire(created) }, 201);
}

async function patchItem(
  context: AppContext,
  root: CompositionRoot,
): Promise<Response> {
  const items = root.items;
  if (items === null) {
    return sendReason(context, root.clock, "RAZORPAY_UNAVAILABLE");
  }
  const parsed = itemPatchSchema.safeParse(context.get("admitted").parsedBody);
  if (!parsed.success) {
    return sendReason(context, root.clock, "SCHEMA_VIOLATION");
  }
  return context.json({ item: await update(items, context, parsed.data) });
}

async function update(
  items: ItemCatalog,
  context: AppContext,
  body: ReturnType<typeof itemPatchSchema.parse>,
): Promise<Record<string, unknown>> {
  const itemId = context.req.param("id") ?? "";
  return itemWire(await items.updateItem(itemId, toItemPatch(body)));
}
