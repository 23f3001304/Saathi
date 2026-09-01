import type { Hono } from "hono";

import type { CompositionRoot } from "../../composition-root.js";
import type { PaymentView } from "../../read/payment-queries.js";
import type { AppEnv } from "../app-env.js";
import type { AdmissionDeps } from "../middleware/acp-headers.js";
import { readHeaders } from "../middleware/acp-headers.js";
import { positiveInt } from "./reply.js";

const DEFAULT_TXN_LIMIT = 50;

const MAX_TXN_LIMIT = 500;

/**
 * `/folds/*` and `/transactions` (§4.10).
 *
 * DECISION: `/folds/prices/:sku` serves its `points[]` and reports
 * `anchor: null`. Why: the anchor is `PriceAnchorAnalyzer`'s verdict and that
 * analyser lives in `@covenant/recs`, which is being built in parallel; the
 * attested price points are already in `sku_price_history` and withholding
 * them behind a 501 would hide data the ledger has. TODO: one-line swap to
 * `recs.priceAnchor(points)` once the package exports it.
 */
/**
 * Reading an unsettled payment arms the poller for it. A GET with an effect is
 * worth a second look, so: the effect is idempotent, writes no answer of its
 * own, and only causes the gateway to *look* at a rail it already owns. The
 * alternative — a watch started once at link-issue time — dies with its five
 * minute window and with any restart, which is exactly the interval a shopper
 * spends deciding. Tying the look to someone actually waiting for it is both
 * more robust and less traffic.
 */
function watchIfOpen(
  root: CompositionRoot,
  tenantId: string,
  view: PaymentView,
): void {
  if (view.payment_state !== "waiting" || view.rzp_order_id === null) {
    return;
  }
  root.services.watcher.ensure({
    txnId: view.txn_id,
    tenantId,
    mandateId: view.payment_mandate_id,
    orderId: view.rzp_order_id,
  });
}

/** What a bill on screen asks about its own money, long after the run ended. */
function registerPayment(
  app: Hono<AppEnv>,
  root: CompositionRoot,
  admission: AdmissionDeps,
): void {
  app.get("/v1/transactions/:id/payment", readHeaders(admission), (context) => {
    const tenantId = context.get("tenantId");
    const view = root.read.payments.byTxn(tenantId, context.req.param("id"));
    // Not a §4.6 reason envelope: no rule refused anything, this tenant simply
    // has no such transaction. Inventing a reason code for it would put a
    // policy word on a lookup miss.
    if (view === null) {
      return context.json({ ok: false, error: "unknown transaction" }, 404);
    }
    watchIfOpen(root, tenantId, view);
    return context.json(view);
  });
}

function registerTransactions(
  app: Hono<AppEnv>,
  root: CompositionRoot,
  admission: AdmissionDeps,
): void {
  app.get("/v1/transactions", readHeaders(admission), (context) => {
    const limit = positiveInt(
      context.req.query("limit"),
      DEFAULT_TXN_LIMIT,
      MAX_TXN_LIMIT,
    );
    return context.json({
      items: root.read.transactions.list(
        context.get("tenantId"),
        limit,
        context.req.query("state") ?? null,
      ),
    });
  });
}

export function registerFolds(app: Hono<AppEnv>, root: CompositionRoot): void {
  const admission = {
    config: root.config,
    clock: root.clock,
    gate: root.keys.admission,
    keys: root.keys.keys,
  };

  app.get("/v1/folds/summary", readHeaders(admission), (context) =>
    context.json(root.read.folds.summary()),
  );

  app.get("/v1/folds/merchants", readHeaders(admission), (context) =>
    context.json(root.read.folds.merchants(context.get("tenantId"))),
  );

  app.get("/v1/folds/prices/:sku", readHeaders(admission), (context) => {
    const sku = context.req.param("sku") ?? "";
    return context.json({
      sku_id: sku,
      points: root.read.folds.prices(context.get("tenantId"), sku),
      anchor: null,
    });
  });

  registerPayment(app, root, admission);
  registerTransactions(app, root, admission);
}
