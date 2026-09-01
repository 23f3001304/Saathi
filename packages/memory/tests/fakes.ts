import type {
  Clock,
  IdGenerator,
  LedgerFrame,
  LogFields,
  Logger,
  MandateRole,
  MandateVerifier,
  PromptInput,
  PromptJudge,
  ResponseSchema,
  Span,
  Tracer,
  VerifiedJwt,
  VerifyExpectation,
} from "@covenant/domain";
import type { FramePublisher } from "@covenant/ledger";

/** Injected fakes, not a mocking framework (stack lock, ARCHITECTURE 10). */
export class FixedClock implements Clock {
  constructor(private instant: Date = new Date("2026-08-31T12:00:00.000Z")) {}

  now(): Date {
    return new Date(this.instant);
  }

  set(instant: Date): void {
    this.instant = instant;
  }

  advance(ms: number): void {
    this.instant = new Date(this.instant.getTime() + ms);
  }
}

export class CountingIds implements IdGenerator {
  private next = 0;

  uuid(): string {
    this.next += 1;
    const tail = this.next.toString(16).padStart(12, "0");
    return `00000000-0000-4000-8000-${tail}`;
  }
}

export class RecordingPublisher implements FramePublisher {
  readonly frames: LedgerFrame[] = [];

  publish(frames: readonly LedgerFrame[]): void {
    this.frames.push(...frames);
  }
}

class NoopSpan implements Span {
  setAttribute(): void {}
  setStatus(): void {}
  recordException(): void {}
  end(): void {}
}

export class NoopTracer implements Tracer {
  startSpan(): Span {
    return new NoopSpan();
  }
}

export class SilentLogger implements Logger {
  readonly lines: { readonly evt: string; readonly fields: LogFields }[] = [];

  private record(evt: string, fields: LogFields): void {
    this.lines.push({ evt, fields });
  }

  debug(evt: string, fields: LogFields): void {
    this.record(evt, fields);
  }
  info(evt: string, fields: LogFields): void {
    this.record(evt, fields);
  }
  warn(evt: string, fields: LogFields): void {
    this.record(evt, fields);
  }
  error(evt: string, fields: LogFields): void {
    this.record(evt, fields);
  }
  fatal(evt: string, fields: LogFields): void {
    this.record(evt, fields);
  }
}

export const USER_SIG = "jws.user";
export const MERCHANT_SIG = "jws.merchant";

const PINNED: Record<string, MandateRole> = {
  [USER_SIG]: "user",
  [MERCHANT_SIG]: "merchant",
};

/** Stands in for `Es256Verifier`: pinned ring, role-bound, fail closed. */
export class StubVerifier implements MandateVerifier {
  async verify(jwt: string, expected: VerifyExpectation): Promise<VerifiedJwt> {
    const role = PINNED[jwt];
    if (role === undefined || role !== expected.role) {
      throw new Error(`SIGNER_UNKNOWN: ${jwt}`);
    }
    return {
      claims: { jti: `urn:uuid:${role}-attestation` },
      kid: `${role}-2026-08-3f9a1c40`,
      role,
      jwtHash: "0".repeat(64),
    };
  }
}

export type JudgeReply =
  | { readonly kind: "reply"; readonly body: unknown }
  | { readonly kind: "throw"; readonly message: string }
  | { readonly kind: "hang" };

class ScriptedJudge implements PromptJudge {
  constructor(private readonly reply: JudgeReply) {}

  async judge<T>(
    _promptId: string,
    _input: PromptInput,
    schema: ResponseSchema<T>,
  ): Promise<T> {
    if (this.reply.kind === "throw") {
      throw new Error(this.reply.message);
    }
    if (this.reply.kind === "hang") {
      return await new Promise<T>(() => undefined);
    }
    return schema(this.reply.body);
  }
}

/** Typed as the port, so the fourth `options` argument stays in the contract. */
export function scriptedJudge(reply: JudgeReply): PromptJudge {
  return new ScriptedJudge(reply);
}
