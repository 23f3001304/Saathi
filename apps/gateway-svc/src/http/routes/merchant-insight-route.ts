import type { Hono } from "hono";

import type { CompositionRoot } from "../../composition-root.js";
import type { ListingAudit } from "../../merchant/listing-audit.js";
import { auditCopy, auditListings } from "../../merchant/listing-audit.js";
import type { AppContext, AppEnv } from "../app-env.js";
import { readHeaders } from "../middleware/acp-headers.js";
import { sendReason } from "./reply.js";

const AUDIT_LIMIT = 100;

/** "This week", as the dashboard sentence means it. */
const WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * The four questions a shopkeeper actually has, each answered from the ledger
 * or from Razorpay and from nowhere else:
 *
 *   standing  — the `merchant_trust` fold, with its arithmetic shown
 *   listings  — their own copy read by the same detector a buyer agent runs
 *   demand    — what buyers asked for that this shop could not serve
 *   leakage   — the reason codes verdicts named while deciding their carts
 *   negotiated — what the floors they signed actually won them
 *
 * Every figure here is a count or a rate over rows the system already holds.
 * Nothing on this surface is a model's summary of anything.
 */
export function registerMerchantInsight(
  app: Hono<AppEnv>,
  root: CompositionRoot,
): void {
  const admission = {
    config: root.config,
    clock: root.clock,
    gate: root.keys.admission,
    keys: root.keys.keys,
  };

  app.get("/v1/merchant/standing", readHeaders(admission), (context) =>
    context.json(standingBody(context, root)),
  );

  app.get("/v1/merchant/listings/audit", readHeaders(admission), (context) =>
    auditRoute(context, root),
  );

  app.get(
    "/v1/merchant/listings/draft-audit",
    readHeaders(admission),
    (context) => context.json(draftAuditBody(context)),
  );

  app.get("/v1/merchant/demand", readHeaders(admission), (context) =>
    context.json(demandBody(context, root)),
  );

  app.get("/v1/merchant/leakage", readHeaders(admission), (context) =>
    context.json(leakageBody(context, root)),
  );

  app.get("/v1/merchant/negotiated", readHeaders(admission), (context) =>
    context.json(negotiatedBody(context, root)),
  );
}

/**
 * The one number on this console that is a sale *made* rather than a sale
 * explained. It is a fold over `negotiation.settled` — appended by the gateway
 * inside the same savepoint that approved the cart, so a row here cannot exist
 * without the verdict that produced it.
 */
function negotiatedBody(
  context: AppContext,
  root: CompositionRoot,
): Record<string, unknown> {
  const merchantId = merchantIdOf(context, root);
  const since = root.clock.now().getTime() - WINDOW_MS;
  return {
    merchant_id: merchantId,
    window_days: WINDOW_MS / (24 * 60 * 60 * 1000),
    settled: root.read.insights.settledBelowList(
      context.get("tenantId"),
      merchantId,
      since,
    ),
    source_event: "negotiation.settled",
  };
}

function draftAuditBody(context: AppContext): ListingAudit {
  return auditCopy(
    copyParam(context, "name"),
    copyParam(context, "description"),
  );
}

/** Razorpay caps a description at 2048; a longer query is a caller's bug. */
const COPY_MAX = 2048;

function copyParam(context: AppContext, name: string): string {
  return (context.req.query(name) ?? "").slice(0, COPY_MAX);
}

/**
 * `standing` is the one merchant this caller asked about; `merchants` is every
 * merchant the tenant has folded. Both are served because they answer
 * different questions — the shopkeeper's console wants its own row and the
 * audit UI wants the table — and because the fold is public arithmetic over a
 * public ledger either way.
 */
function standingBody(
  context: AppContext,
  root: CompositionRoot,
): Record<string, unknown> {
  const merchantId = merchantIdOf(context, root);
  const tenantId = context.get("tenantId");
  return {
    merchants: root.read.merchants.standings(tenantId),
    standing: root.read.merchants.standing(tenantId, merchantId),
    enrolled: enrolledMerchants(root),
    merchant_id: merchantId,
  };
}

function demandBody(
  context: AppContext,
  root: CompositionRoot,
): Record<string, unknown> {
  const merchantId = merchantIdOf(context, root);
  return {
    merchant_id: merchantId,
    unmet: root.read.insights.unmetDemand(context.get("tenantId"), merchantId),
    // Named on the wire so an empty panel says which event it is waiting for.
    source_event: "catalog.read",
  };
}

function leakageBody(
  context: AppContext,
  root: CompositionRoot,
): Record<string, unknown> {
  const merchantId = merchantIdOf(context, root);
  const tenantId = context.get("tenantId");
  return {
    merchant_id: merchantId,
    standing: root.read.merchants.standing(tenantId, merchantId),
    refusals: root.read.insights.refusals(tenantId, merchantId),
  };
}

async function auditRoute(
  context: AppContext,
  root: CompositionRoot,
): Promise<Response> {
  const items = root.items;
  if (items === null) {
    return sendReason(context, root.clock, "RAZORPAY_UNAVAILABLE");
  }
  return context.json(auditListings(await items.listItems(AUDIT_LIMIT)));
}

/**
 * The trust fold keys on the merchant's short id (`kolam-run`) while the ring
 * keys on their URN. One is the tail of the other, and deriving it here beats
 * carrying a second mapping that could disagree with the ring.
 */
function merchantIdOf(context: AppContext, root: CompositionRoot): string {
  const asked = context.req.query("merchant");
  if (asked !== undefined && asked !== "") {
    return asked;
  }
  const issuer = root.keys.keys.issuerFor("merchant") ?? "";
  return issuer.slice(issuer.lastIndexOf(":") + 1);
}

/**
 * Which merchant URNs the running process pinned at boot, and under which kids.
 * A merchant onboarded after that boot is absent here until the gateway is
 * restarted — the ring is read once and never fetched (§6.7 rule 1) — and the
 * console says so rather than leaving them to find out at their first quote.
 */
function enrolledMerchants(
  root: CompositionRoot,
): readonly { readonly issuer: string; readonly kids: readonly string[] }[] {
  return Object.entries(root.keys.ring.issuers)
    .filter(([, entry]) => entry.role === "merchant")
    .map(([issuer, entry]) => ({ issuer, kids: entry.kids }));
}
