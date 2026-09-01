import type {
  Clock,
  IdGenerator,
  LogFields,
  Logger,
  NonceBurnRecord,
  NonceBurnResult,
  NoncePurpose,
  NonceRegistry,
  NonceState,
} from "@covenant/domain";
import { resolveIdempotency } from "@covenant/domain";

/** Determinism seam: no test ever reads the wall clock. */
export class FixedClock implements Clock {
  constructor(private instant: Date) {}

  now(): Date {
    return new Date(this.instant.getTime());
  }

  set(instant: Date): void {
    this.instant = instant;
  }

  advance(seconds: number): void {
    this.instant = new Date(this.instant.getTime() + seconds * 1000);
  }
}

/** UUID-v4-shaped but counted, so a golden vector can pin a `jti`. */
export class SequenceIdGenerator implements IdGenerator {
  private next = 0;

  uuid(): string {
    const hex = (this.next++).toString(16).padStart(12, "0");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4000-8000-${hex}`;
  }
}

export class RecordingLogger implements Logger {
  readonly lines: { evt: string; fields: LogFields }[] = [];

  debug(evt: string, fields: LogFields): void {
    this.lines.push({ evt, fields });
  }

  info(evt: string, fields: LogFields): void {
    this.lines.push({ evt, fields });
  }

  warn(evt: string, fields: LogFields): void {
    this.lines.push({ evt, fields });
  }

  error(evt: string, fields: LogFields): void {
    this.lines.push({ evt, fields });
  }

  fatal(evt: string, fields: LogFields): void {
    this.lines.push({ evt, fields });
  }
}

/**
 * Stands in for `SqliteNonceRegistry` with the same enforcement shape: the burn
 * is an insert against `PRIMARY KEY (nonce, purpose)`, so the second presenter
 * of one jti loses on the write, not on a read-then-check (§5.2 a).
 */
export class MapNonceRegistry implements NonceRegistry {
  private readonly rows = new Map<string, NonceState>();

  peek(nonce: string, purpose: NoncePurpose): NonceState | null {
    return this.rows.get(keyOf(nonce, purpose)) ?? null;
  }

  burn(record: NonceBurnRecord): NonceBurnResult {
    const key = keyOf(record.nonce, record.purpose);
    const stored = this.rows.get(key);
    if (stored === undefined) {
      this.rows.set(key, record);
      return { status: "burned" };
    }
    const outcome = resolveIdempotency(stored, {
      tenantId: record.tenantId,
      idempotencyKey: record.idempotencyKey,
      payloadHash: record.payloadHash,
    });
    return outcome.status === "replay"
      ? { status: "replay", state: stored }
      : { status: "conflict", state: stored };
  }
}

function keyOf(nonce: string, purpose: NoncePurpose): string {
  return `${nonce}|${purpose}`;
}
