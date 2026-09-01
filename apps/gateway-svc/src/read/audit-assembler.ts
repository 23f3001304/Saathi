import type { Database as SqliteDatabase } from "better-sqlite3";

import type { Clock, StoredEvent } from "@covenant/domain";
import type { LedgerVerifier, SqliteEventReader } from "@covenant/ledger";
import type { SqliteMemoryReader } from "@covenant/memory";

import {
  auditEventsOf,
  auditMemoriesOf,
  outcomeOf,
  razorpayCallsOf,
  retrievedIdsOf,
  verdictsOf,
} from "./audit-sections.js";
import { decodeSubject } from "./jwt-subject.js";

interface MandateRow {
  readonly id: string;
  readonly kind: string;
  readonly vc_jwt: string;
  readonly parent_id: string | null;
  readonly memory_digest: string | null;
  readonly cart_hash: string | null;
  readonly iat: string;
}

interface TxnRow {
  readonly cart_mandate_id: string;
  readonly amount_paise: number;
  readonly currency: string;
  readonly tenant_id: string;
}

interface EnvelopeRow {
  readonly category: string;
  readonly amount_paise: number;
  readonly state: string;
  readonly period_key: string;
}

const TXN_SQL = `SELECT cart_mandate_id, amount_paise, currency, tenant_id
  FROM transactions WHERE id = ?`;

const MANDATE_SQL = `SELECT id, kind, vc_jwt, parent_id, memory_digest, cart_hash, iat
  FROM mandates WHERE id = ?`;

const ENVELOPE_SQL = `SELECT category, amount_paise, state, period_key
  FROM envelope_reservations WHERE txn_id = ?`;

function intentBlockOf(intent: MandateRow | null): unknown {
  if (intent === null) {
    return null;
  }
  const subject = decodeSubject(intent.vc_jwt);
  return {
    mandate_id: intent.id,
    natural_language_description:
      subject["natural_language_description"] ?? "",
    bounds: subject,
    signed_by: "user",
    iat: intent.iat,
  };
}

function cartBlockOf(txn: TxnRow, cart: MandateRow | null): unknown {
  if (cart === null) {
    return null;
  }
  const subject = decodeSubject(cart.vc_jwt);
  return {
    mandate_id: cart.id,
    cart_hash: cart.cart_hash,
    amount: txn.amount_paise,
    currency: txn.currency,
    merchant_id: subject["merchant_id"] ?? null,
    lines: subject["payment_request"] ?? [],
  };
}

/**
 * `GET /audit/:txn_id` (§4.12): the causal chain of one purchase, assembled
 * from the ledger slice plus the projections that slice produced. `chain_ok`
 * is a real hash-chain walk over the transaction's own events — the page makes
 * a verifiable claim, so the claim is verified on the way out.
 */
export class AuditAssembler {
  constructor(
    private readonly db: SqliteDatabase,
    private readonly reader: SqliteEventReader,
    private readonly memory: SqliteMemoryReader,
    private readonly verifier: LedgerVerifier,
    private readonly clock: Clock,
  ) {}

  assemble(txnId: string): Readonly<Record<string, unknown>> | null {
    const txn = this.db.prepare(TXN_SQL).get(txnId) as TxnRow | undefined;
    if (txn === undefined) {
      return null;
    }
    const events = this.reader.byTxn(txnId);
    const cart = this.mandate(txn.cart_mandate_id);
    return {
      ok: true,
      txn_id: txnId,
      ...this.credentials(txn, cart),
      ...this.evidence(txnId, txn, events, cart),
      events: auditEventsOf(events),
      chain_ok: this.verifier.verifyTxn(txnId),
    };
  }

  private credentials(
    txn: TxnRow,
    cart: MandateRow | null,
  ): Readonly<Record<string, unknown>> {
    const intent = this.mandate(cart?.parent_id ?? null);
    return { intent: intentBlockOf(intent), cart: cartBlockOf(txn, cart) };
  }

  private evidence(
    txnId: string,
    txn: TxnRow,
    events: readonly StoredEvent[],
    cart: MandateRow | null,
  ): Readonly<Record<string, unknown>> {
    const entries = this.memory.getByIds(txn.tenant_id, retrievedIdsOf(events));
    const envelopes = this.db.prepare(ENVELOPE_SQL).all(txnId) as EnvelopeRow[];
    return {
      memories: auditMemoriesOf(entries, this.clock.now()),
      memory_digest: cart?.memory_digest ?? null,
      verdicts: verdictsOf(events),
      envelopes: envelopes.map((row) => ({
        category: row.category,
        cap_paise: 0,
        spent_paise: row.state === "captured" ? row.amount_paise : 0,
        reserved_paise: row.state === "open" ? row.amount_paise : 0,
        period_resets_at: row.period_key,
      })),
      razorpay: razorpayCallsOf(events),
      outcome: outcomeOf(events),
    };
  }

  private mandate(id: string | null): MandateRow | null {
    if (id === null) {
      return null;
    }
    return (this.db.prepare(MANDATE_SQL).get(id) as MandateRow | undefined) ?? null;
  }
}
