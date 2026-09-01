import { PINNED_CONTEXT_URIS } from "@covenant/domain";

import {
  ExecutePaymentBracket,
  ExecutePaymentService,
  IdempotencyResolver,
  PaymentMandateFactory,
  ReservationWriter,
  RiskAttestationVerifier,
  SpendWindow,
  VerdictContextBuilder,
  VerdictDecision,
  VerdictEngine,
  VerdictLedger,
  VerdictPipeline,
  VerifyCartCommitter,
  VerifyCartRejector,
  VerifyCartService,
} from "../src/index.js";
import type { Parts } from "./stores.js";
import { API_VERSION, orderedChecks } from "./stores.js";

/** The composition-root shape, rehearsed: every collaborator is `new`ed here. */
export function pipelineOf(parts: Parts): VerdictPipeline {
  return new VerdictPipeline(
    new VerdictContextBuilder(
      parts.memory,
      parts.nonces,
      new SpendWindow(parts.db),
      parts.stock,
      parts.floors,
      parts.clock,
      {
        pinnedUris: PINNED_CONTEXT_URIS,
        apiVersion: API_VERSION,
        cancelUrlBase: "/v1/cooloff",
      },
    ),
    new VerdictEngine(orderedChecks(), parts.tracer),
    new VerdictDecision(),
  );
}

export function verifyServiceOf(
  parts: Parts,
  pipeline: VerdictPipeline,
  idempotency: IdempotencyResolver,
): VerifyCartService {
  return new VerifyCartService(
    parts.crypto.chain,
    idempotency,
    new RiskAttestationVerifier(parts.crypto.verifier),
    pipeline,
    new PaymentMandateFactory(parts.crypto.payments, parts.clock, parts.ids, {
      ttlSeconds: 900,
      executeDelaySeconds: 0,
    }),
    new VerifyCartCommitter(
      parts.ledger,
      parts.events,
      parts.nonces,
      parts.ports,
      new ReservationWriter(parts.ports, parts.ids),
      parts.clock,
      parts.ids,
    ),
    new VerifyCartRejector(
      pipeline,
      new VerdictLedger(parts.events),
      idempotency,
      parts.ledger,
      parts.ids,
    ),
    parts.ledger,
    parts.ids,
    parts.tracer,
  );
}

export function executeServiceOf(
  parts: Parts,
  idempotency: IdempotencyResolver,
): ExecutePaymentService {
  return new ExecutePaymentService(
    parts.crypto.chain,
    parts.rail,
    idempotency,
    new ExecutePaymentBracket(
      parts.events,
      parts.nonces,
      parts.nonces,
      parts.transactions,
      parts.clock,
    ),
    parts.ledger,
    parts.transactions,
    parts.tracer,
  );
}
