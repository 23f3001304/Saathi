import type { Clock, IdGenerator, LogFields, Logger } from "@covenant/domain";

/** Monotonic and boring, so a journal's timestamps are reproducible. */
export class StepClock implements Clock {
  private ms = Date.parse("2026-08-31T09:00:00.000Z");

  now(): Date {
    this.ms += 1000;
    return new Date(this.ms);
  }
}

/** The route tests assert on responses, not on what was logged along the way. */
export class SilentLogger implements Logger {
  debug(): void {
    return;
  }
  info(): void {
    return;
  }
  warn(): void {
    return;
  }
  error(): void {
    return;
  }
  fatal(): void {
    return;
  }
}

/** UUID-v4-shaped and deterministic, so a chained journal replays identically. */
export class SeqIds implements IdGenerator {
  private next = 0;

  uuid(): string {
    this.next += 1;
    return `00000000-0000-4000-8000-${this.next.toString(16).padStart(12, "0")}`;
  }
}

export interface LogLine {
  readonly level: string;
  readonly evt: string;
  readonly fields: LogFields;
}

/** For the tests where what was logged is the behaviour under test. */
export class RecordingLogger implements Logger {
  readonly lines: LogLine[] = [];

  private push(level: string, evt: string, fields: LogFields): void {
    this.lines.push({ level, evt, fields });
  }

  debug = (evt: string, f: LogFields): void => this.push("debug", evt, f);
  info = (evt: string, f: LogFields): void => this.push("info", evt, f);
  warn = (evt: string, f: LogFields): void => this.push("warn", evt, f);
  error = (evt: string, f: LogFields): void => this.push("error", evt, f);
  fatal = (evt: string, f: LogFields): void => this.push("fatal", evt, f);
}
