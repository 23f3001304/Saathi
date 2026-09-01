import type { Clock, IdGenerator, PaymentRail } from "@covenant/domain";
import {
  CooloffScheduler,
  CooloffTransitions,
  ExecutePaymentBracket,
  ExecutePaymentService,
  IdempotencyResolver,
  PaymentMandateFactory,
  PaymentOutcomeService,
  PriceFloorService,
  RazorpayWebhookVerifier,
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
  WebhookService,
} from "@covenant/gateway";
import type { PaymentWatcher } from "@covenant/gateway";

import { NodeTimers } from "../adapters/system-ports.js";
import type { GatewayConfig } from "../config.js";
import { wireChecks } from "./check-wiring.js";
import type { KeyParts } from "./key-wiring.js";
import type { ObsParts } from "./obs-wiring.js";
import type { StoreParts } from "./store-wiring.js";
import { wireWatcher } from "./watch-wiring.js";

/** The Payment Mandate's own lifetime, and the cool-off-free execute delay. */
const PAYMENT_MANDATE_TTL_SECONDS = 900;

export interface ServiceParts {
  readonly verifyCart: VerifyCartService;
  readonly executePayment: ExecutePaymentService;
  readonly cooloff: CooloffScheduler;
  readonly outcomes: PaymentOutcomeService;
  readonly watcher: PaymentWatcher;
  readonly floors: PriceFloorService;
  readonly webhooks: WebhookService;
}

export interface ServiceDeps {
  readonly config: GatewayConfig;
  readonly obs: ObsParts;
  readonly stores: StoreParts;
  readonly keys: KeyParts;
  readonly rail: PaymentRail;
  readonly clock: Clock;
  readonly ids: IdGenerator;
}

function pipelineOf(deps: ServiceDeps): VerdictPipeline {
  return new VerdictPipeline(
    new VerdictContextBuilder(
      deps.stores.memoryStore,
      deps.stores.nonces,
      new SpendWindow(deps.stores.db),
      deps.stores.stock,
      deps.stores.floors,
      deps.clock,
      {
        pinnedUris: deps.keys.keys.pinnedContextUris(),
        apiVersion: deps.config.apiVersion,
        cancelUrlBase: "/v1/cooloff",
      },
    ),
    new VerdictEngine(wireChecks(), deps.obs.tracer),
    new VerdictDecision(),
  );
}

function verifyOf(
  deps: ServiceDeps,
  idempotency: IdempotencyResolver,
): VerifyCartService {
  const pipeline = pipelineOf(deps);
  const stores = deps.stores;
  return new VerifyCartService(
    deps.keys.chain,
    idempotency,
    new RiskAttestationVerifier(deps.keys.verifier),
    pipeline,
    new PaymentMandateFactory(deps.keys.payments, deps.clock, deps.ids, {
      ttlSeconds: PAYMENT_MANDATE_TTL_SECONDS,
      executeDelaySeconds: 0,
    }),
    new VerifyCartCommitter(
      stores.ledger,
      stores.events,
      stores.nonces,
      stores.ports,
      new ReservationWriter(stores.ports, deps.ids),
      deps.clock,
      deps.ids,
    ),
    new VerifyCartRejector(
      pipeline,
      new VerdictLedger(stores.events),
      idempotency,
      stores.ledger,
      deps.ids,
    ),
    stores.ledger,
    deps.ids,
    deps.obs.tracer,
  );
}

function executeOf(
  deps: ServiceDeps,
  idempotency: IdempotencyResolver,
): ExecutePaymentService {
  const stores = deps.stores;
  return new ExecutePaymentService(
    deps.keys.chain,
    deps.rail,
    idempotency,
    new ExecutePaymentBracket(
      stores.events,
      stores.nonces,
      stores.nonces,
      stores.transactions,
      deps.clock,
    ),
    stores.ledger,
    stores.transactions,
    deps.obs.tracer,
  );
}

function cooloffOf(
  deps: ServiceDeps,
  executePayment: ExecutePaymentService,
): CooloffScheduler {
  const stores = deps.stores;
  return new CooloffScheduler(
    stores.transactions,
    stores.mandates,
    new CooloffTransitions(
      stores.ledger,
      stores.events,
      stores.transactions,
      stores.envelopes,
      deps.clock,
    ),
    executePayment,
    new NodeTimers(),
    deps.clock,
    deps.ids,
    deps.obs.logger,
  );
}

/** The use-case layer, assembled in the one order the design rehearses (§2.8). */
export function wireServices(deps: ServiceDeps): ServiceParts {
  const stores = deps.stores;
  const idempotency = new IdempotencyResolver(stores.nonces);
  const executePayment = executeOf(deps, idempotency);
  const outcomes = new PaymentOutcomeService(
    stores.ledger,
    stores.events,
    stores.reader,
    stores.transactions,
    stores.envelopes,
  );
  return {
    verifyCart: verifyOf(deps, idempotency),
    executePayment,
    outcomes,
    watcher: wireWatcher(deps.rail, outcomes, stores, deps.obs, deps.clock),
    floors: new PriceFloorService(
      stores.floors,
      stores.events,
      stores.ledger,
      deps.clock,
    ),
    cooloff: cooloffOf(deps, executePayment),
    webhooks: new WebhookService(
      new RazorpayWebhookVerifier(deps.config.webhookSecret),
      outcomes,
      stores.transactions,
      stores.events,
      stores.ledger,
    ),
  };
}
