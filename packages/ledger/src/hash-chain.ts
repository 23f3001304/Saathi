import type {
  EventHeader,
  EventPayload,
  Sha256Hex,
  StoredEvent,
} from "@covenant/domain";
import { GENESIS_HASH, canonicalize, sha256Hex } from "@covenant/domain";

/**
 * `this_hash = sha256Hex(prev_hash + '\n' + canonicalize(header) + '\n' +
 * canonicalize(payload))` (section 3.2). The header is inside the hash, not
 * only the payload: without it `actor` or `kind` could be rewritten in place
 * with the chain still verifying, and the tamper-evidence claim would be false
 * for exactly the fields the audit UI displays (decision 10).
 */
export class HashChain {
  static readonly GENESIS: Sha256Hex = GENESIS_HASH;

  /** The eight covered header fields, absent ones as `null`, never omitted. */
  headerOf(event: EventHeader): EventHeader {
    return {
      id: event.id,
      ts: event.ts,
      tenant_id: event.tenant_id,
      actor: event.actor,
      kind: event.kind,
      txn_id: event.txn_id,
      request_id: event.request_id,
      mandate_id: event.mandate_id,
    };
  }

  hash(
    prevHash: Sha256Hex,
    header: EventHeader,
    payload: EventPayload,
  ): Sha256Hex {
    const parts = [
      prevHash,
      canonicalize(this.headerOf(header)),
      canonicalize(payload),
    ];
    return sha256Hex(parts.join("\n"));
  }

  recompute(event: StoredEvent): Sha256Hex {
    return this.hash(event.prev_hash, event, event.payload);
  }

  /** One link: it must extend `prevHash` and its digest must be its own. */
  verifyLink(event: StoredEvent, prevHash: Sha256Hex): boolean {
    return (
      event.prev_hash === prevHash && this.recompute(event) === event.this_hash
    );
  }
}
