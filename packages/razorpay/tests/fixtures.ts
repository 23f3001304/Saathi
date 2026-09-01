import type { Clock, Logger, LogFields, Span, SpanStatus, Tracer } from "@covenant/domain";
import type { RazorpayConfig } from "../src/config.js";
import { RAZORPAY_BASE_URL } from "../src/config.js";
import type { Sleep } from "../src/retry-policy.js";

/** Deterministic `Clock`: advances by a fixed step on every `now()` read, so retry
 * jitter and poll deadlines are reproducible without touching real time or `Math.random`. */
export class FakeClock implements Clock {
  private currentMs: number;

  constructor(
    startMs: number,
    private readonly stepMs = 0,
  ) {
    this.currentMs = startMs;
  }

  now(): Date {
    const value = this.currentMs;
    this.currentMs += this.stepMs;
    return new Date(value);
  }
}

export const instantSleep: Sleep = async () => {
  /* no-op: tests never wait on real timers */
};

export function recordingSleep(calls: number[]): Sleep {
  return async (ms: number) => {
    calls.push(ms);
  };
}

export class RecordingTracer implements Tracer {
  readonly spans: { name: string; status: SpanStatus | null }[] = [];

  startSpan(name: string): Span {
    const record: { name: string; status: SpanStatus | null } = { name, status: null };
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

export class RecordingLogger implements Logger {
  readonly lines: { level: string; evt: string; fields: LogFields }[] = [];

  debug(evt: string, fields: LogFields): void {
    this.lines.push({ level: "debug", evt, fields });
  }

  info(evt: string, fields: LogFields): void {
    this.lines.push({ level: "info", evt, fields });
  }

  warn(evt: string, fields: LogFields): void {
    this.lines.push({ level: "warn", evt, fields });
  }

  error(evt: string, fields: LogFields): void {
    this.lines.push({ level: "error", evt, fields });
  }

  fatal(evt: string, fields: LogFields): void {
    this.lines.push({ level: "fatal", evt, fields });
  }
}

export const testConfig: RazorpayConfig = {
  keyId: "rzp_test_fixture0000",
  keySecret: "fixture_secret",
  baseUrl: RAZORPAY_BASE_URL,
  timeoutMs: 5_000,
  linkedAccountId: null,
};

export function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export function fakeFetchSequence(
  responses: readonly (Response | { networkError: true })[],
): { fetch: typeof fetch; calls: { url: string; init: RequestInit | undefined }[] } {
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  let index = 0;
  const fetchImpl = async (url: string | URL, init?: RequestInit): Promise<Response> => {
    calls.push({ url: String(url), init });
    const next = responses[Math.min(index, responses.length - 1)];
    index += 1;
    if (next === undefined || "networkError" in next) {
      throw new TypeError("fetch failed: simulated network error");
    }
    return next;
  };
  return { fetch: fetchImpl as typeof fetch, calls };
}

export * from "./response-fixtures.js";
