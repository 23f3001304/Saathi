import type { Clock } from "@covenant/domain";

import type { GatewayConfig } from "../config.js";
import { ReadinessProbe } from "../health/readiness-probe.js";
import { AuditAssembler } from "../read/audit-assembler.js";
import { FoldQueries } from "../read/fold-queries.js";
import { LaneQueries } from "../read/lane-queries.js";
import { MerchantInsightQueries } from "../read/merchant-insight-queries.js";
import { MerchantQueries } from "../read/merchant-queries.js";
import { PaymentQueries } from "../read/payment-queries.js";
import { TransactionQueries } from "../read/txn-queries.js";
import type { DrainGate } from "../shutdown.js";
import type { FoldParts } from "./fold-wiring.js";
import type { KeyParts } from "./key-wiring.js";
import type { MemoryParts } from "./memory-wiring.js";
import type { StoreParts } from "./store-wiring.js";

export interface ReadParts {
  readonly audit: AuditAssembler;
  readonly transactions: TransactionQueries;
  readonly payments: PaymentQueries;
  readonly folds: FoldQueries;
  readonly merchants: MerchantQueries;
  readonly insights: MerchantInsightQueries;
  readonly lanes: LaneQueries;
  readonly readiness: ReadinessProbe;
}

/**
 * Every read endpoint runs on the read-only handle against a WAL snapshot and
 * is therefore invisible to the write path (§5.1). The one exception is the
 * readiness probe's `sqlite_vec` check, which asks the writer's own connection
 * because that is the one the write gate will actually use.
 */
export function wireReadSide(
  config: GatewayConfig,
  stores: StoreParts,
  folds: FoldParts,
  keys: KeyParts,
  memory: MemoryParts,
  gate: DrainGate,
  clock: Clock,
): ReadParts {
  return {
    audit: new AuditAssembler(
      stores.readDb,
      stores.reader,
      stores.readMemory,
      folds.verifier,
      clock,
    ),
    transactions: new TransactionQueries(stores.readDb),
    payments: new PaymentQueries(stores.readDb, config.razorpay.keyId),
    folds: new FoldQueries(stores.readDb),
    merchants: new MerchantQueries(stores.readDb),
    insights: new MerchantInsightQueries(stores.readDb),
    lanes: new LaneQueries(stores.readDb),
    readiness: new ReadinessProbe(
      stores.reader,
      keys.keys,
      stores.vec,
      memory.drift,
      gate,
      config.rail,
      config.razorpay.keyId !== "",
    ),
  };
}
