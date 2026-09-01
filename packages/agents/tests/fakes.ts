import { createHmac } from "node:crypto";

import type {
  Clock,
  EventDraft,
  EventSink,
  IdGenerator,
  JwtClaims,
  Logger,
  LogFields,
  MandateRole,
  MandateSigner,
  MandateVerifier,
  Span,
  SpanStatus,
  StoredEvent,
  Tracer,
  VerifiedJwt,
  VerifyExpectation,
} from "@covenant/domain";
import { roleOfKid, sha256Hex } from "@covenant/domain";

export class FakeClock implements Clock {
  private ms: number;

  constructor(startIso: string, private readonly stepMs = 0) {
    this.ms = Date.parse(startIso);
  }

  now(): Date {
    const value = this.ms;
    this.ms += this.stepMs;
    return new Date(value);
  }

  advance(ms: number): void {
    this.ms += ms;
  }
}

/** UUID-v4-shaped and deterministic, so branded ids parse and goldens hold. */
export class SeqIds implements IdGenerator {
  private next = 0;

  uuid(): string {
    this.next += 1;
    const tail = this.next.toString(16).padStart(12, "0");
    return `00000000-0000-4000-8000-${tail}`;
  }
}

export class RecordingLogger implements Logger {
  readonly lines: { level: string; evt: string; fields: LogFields }[] = [];

  private push(level: string, evt: string, fields: LogFields): void {
    this.lines.push({ level, evt, fields });
  }

  debug = (evt: string, f: LogFields): void => this.push("debug", evt, f);
  info = (evt: string, f: LogFields): void => this.push("info", evt, f);
  warn = (evt: string, f: LogFields): void => this.push("warn", evt, f);
  error = (evt: string, f: LogFields): void => this.push("error", evt, f);
  fatal = (evt: string, f: LogFields): void => this.push("fatal", evt, f);
}

export class RecordingTracer implements Tracer {
  readonly spans: { name: string; status: SpanStatus | null }[] = [];

  startSpan(name: string): Span {
    const record: { name: string; status: SpanStatus | null } = {
      name,
      status: null,
    };
    this.spans.push(record);
    return {
      setAttribute: () => undefined,
      setStatus: (status: SpanStatus) => {
        record.status = status;
      },
      recordException: () => undefined,
      end: () => undefined,
    };
  }
}

export class RecordingSink implements EventSink {
  readonly events: StoredEvent[] = [];

  append(draft: EventDraft): StoredEvent {
    const seq = this.events.length + 1;
    const stored: StoredEvent = {
      ...draft,
      id: `evt_${seq}`,
      ts: new Date(seq).toISOString(),
      seq,
      ts_ms: seq,
      prev_hash: "0".repeat(64),
      this_hash: sha256Hex(`${seq}`),
    };
    this.events.push(stored);
    return stored;
  }

  kinds(): readonly string[] {
    return this.events.map((event) => event.kind);
  }
}

const SECRET = "covenant-test-key";

function b64u(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function macOf(signingInput: string): string {
  return createHmac("sha256", SECRET).update(signingInput).digest("base64url");
}

export function kidFor(role: MandateRole): string {
  return `${role}-2026-08-3f9a1c40`;
}

/**
 * A real signature over the real signing input, with HMAC standing in for
 * ES256. Tamper tests need a verifier that can actually tell — a stub that
 * returns the payload back would prove nothing about the envelope.
 */
export class HmacMandateSigner implements MandateSigner {
  async sign(claims: JwtClaims, role: MandateRole): Promise<string> {
    const header = b64u(
      JSON.stringify({ alg: "ES256", typ: "JWT", kid: kidFor(role) }),
    );
    const payload = b64u(JSON.stringify(claims));
    return `${header}.${payload}.${macOf(`${header}.${payload}`)}`;
  }
}

export class HmacMandateVerifier implements MandateVerifier {
  async verify(jwt: string, expected: VerifyExpectation): Promise<VerifiedJwt> {
    const [header, payload, signature] = jwt.split(".");
    if (header === undefined || payload === undefined) {
      throw new Error("MANDATE_MALFORMED");
    }
    if (macOf(`${header}.${payload}`) !== signature) {
      throw new Error("SIGNATURE_INVALID");
    }
    const kid = JSON.parse(Buffer.from(header, "base64url").toString()).kid as string;
    const role = roleOfKid(kid);
    if (role === null || role !== expected.role) {
      throw new Error("SIGNER_UNKNOWN");
    }
    const claims = JSON.parse(
      Buffer.from(payload, "base64url").toString(),
    ) as Record<string, unknown>;
    if (claims["aud"] !== expected.audience) {
      throw new Error("SIGNER_UNKNOWN");
    }
    return { claims, kid, role, jwtHash: sha256Hex(jwt) };
  }
}
