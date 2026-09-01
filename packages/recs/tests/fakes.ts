import type {
  Clock,
  Embedder,
  IdGenerator,
  LedgerFrame,
  LogFields,
  Logger,
  MemoryEntry,
  MemoryStore,
  Span,
  Tracer,
} from "@covenant/domain";
import type { FramePublisher } from "@covenant/ledger";

import type { RandomSource } from "../src/index.js";

const AUTO_ADVANCE_MS = 1000;

/**
 * Injected fake, never a mocking framework (stack lock, ARCHITECTURE §10).
 * `now()` auto-advances by a second on every read — mirroring `packages/
 * ledger`'s own `FakeClock` — so that a bi-temporal fold's ordering columns
 * (`t_valid_from`, `t_created`) are never two identical instants apart, which
 * would make "the newer quote closes the older one" undecidable. `set()`
 * still lets a test pin an exact instant (e.g. day-boundary price history).
 */
export class FixedClock implements Clock {
  constructor(private instant: Date = new Date("2026-08-31T12:00:00.000Z")) {}

  now(): Date {
    const current = new Date(this.instant);
    this.instant = new Date(this.instant.getTime() + AUTO_ADVANCE_MS);
    return current;
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

/**
 * Deterministic feature-hashing embedder (mirrors domain decision 12's
 * production default): identical text always embeds identically, and texts
 * sharing tokens land closer together, without a model download in CI.
 */
export class FakeEmbedder implements Embedder {
  constructor(private readonly dimensions = 32) {}

  async embed(text: string): Promise<Float32Array> {
    const vector = new Float32Array(this.dimensions);
    for (const token of text.toLowerCase().match(/[a-z0-9]+/g) ?? []) {
      const bucket = hashToBucket(token, this.dimensions);
      vector[bucket] = (vector[bucket] ?? 0) + 1;
    }
    return Promise.resolve(vector);
  }
}

function hashToBucket(token: string, buckets: number): number {
  let hash = 2166136261;
  for (let index = 0; index < token.length; index += 1) {
    hash = Math.imul(hash ^ token.charCodeAt(index), 16777619);
  }
  return Math.abs(hash) % buckets;
}

/**
 * A deliberately permissive `MemoryStore`: it returns exactly the entries it
 * was seeded with, ignoring tier, quarantine and type entirely — standing in
 * for a buggy or malicious store implementation. `CandidateSource`'s own
 * `isEligible` filter is the only thing between this and a P0 leak, which is
 * exactly the defense-in-depth claim its test asserts.
 */
export class FakeMemoryStore implements MemoryStore {
  constructor(private readonly entries: readonly MemoryEntry[]) {}

  put(): void {
    throw new Error("FakeMemoryStore is read-only");
  }

  getByIds(): readonly MemoryEntry[] {
    return this.entries;
  }

  liveConstraints(): readonly MemoryEntry[] {
    return this.entries.filter((entry) => entry.type === "constraint");
  }

  invalidate(): void {
    throw new Error("FakeMemoryStore is read-only");
  }

  search(): Promise<readonly MemoryEntry[]> {
    return Promise.resolve(this.entries);
  }
}

/** A scripted, non-uniform "random" source so Laplace-noise tests are exact. */
export class ScriptedRandom implements RandomSource {
  private index = 0;

  constructor(private readonly draws: readonly number[]) {}

  next(): number {
    const value = this.draws[this.index % this.draws.length] ?? 0.5;
    this.index += 1;
    return value;
  }
}
