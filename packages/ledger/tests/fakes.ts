import type {
  Clock,
  IdGenerator,
  LedgerFrame,
  LogFields,
  Logger,
  Span,
  Tracer,
} from "@covenant/domain";

import type { FramePublisher } from "../src/index.js";

/** Injected fakes, not a mocking framework (stack lock, ARCHITECTURE 10). */
export class FakeClock implements Clock {
  private ms = Date.UTC(2026, 7, 31, 12, 0, 0);

  now(): Date {
    const instant = new Date(this.ms);
    this.ms += 1000;
    return instant;
  }
}

/** UUID v4 shaped and fully determined by call order. */
export class CountingIds implements IdGenerator {
  private next = 0;

  uuid(): string {
    this.next += 1;
    const tail = this.next.toString(16).padStart(12, "0");
    return `00000000-0000-4000-8000-${tail}`;
  }
}

export class RecordingPublisher implements FramePublisher {
  readonly batches: (readonly LedgerFrame[])[] = [];

  publish(frames: readonly LedgerFrame[]): void {
    this.batches.push(frames);
  }

  get frames(): readonly LedgerFrame[] {
    return this.batches.flat();
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
