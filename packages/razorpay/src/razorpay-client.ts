import type { Clock, Logger, Tracer } from "@covenant/domain";
import { DomainError } from "@covenant/domain";
import type { RazorpayConfig } from "./config.js";
import { isRazorpayApiErrorBody } from "./razorpay-error-mapper.js";
import type { RazorpayErrorMapper } from "./razorpay-error-mapper.js";
import type { RetryPolicy } from "./retry-policy.js";

type HttpMethod = "GET" | "POST" | "PATCH";

/** Native `fetch`, injected — no HTTP client dependency, and the seam a failing-fetch test needs. */
export type FetchLike = typeof fetch;

/**
 * Low-level REST transport: Basic auth, JSON in/out, per-attempt timeout,
 * retry delegated to `RetryPolicy`, and one span + one `rzp.call` log line
 * per attempt (§10.1, §10.4). Holds no Razorpay business semantics — that is
 * `RazorpayPaymentRail`'s job.
 */
export class RazorpayClient {
  constructor(
    private readonly config: RazorpayConfig,
    private readonly fetchImpl: FetchLike,
    private readonly retryPolicy: RetryPolicy,
    private readonly clock: Clock,
    private readonly logger: Logger,
    private readonly tracer: Tracer,
    private readonly errorMapper: RazorpayErrorMapper,
  ) {}

  async request<T>(
    spanName: string,
    method: HttpMethod,
    path: string,
    body: unknown | null,
  ): Promise<T> {
    const span = this.tracer.startSpan(spanName, {
      "http.method": method,
      "http.route": path,
    });
    try {
      const result = await this.retryPolicy.run(
        (attemptNo) => this.attempt<T>(method, path, body, attemptNo),
        (error) => this.errorMapper.isRetryable(error),
      );
      span.setStatus("ok");
      return result;
    } catch (error) {
      span.setStatus("error");
      if (error instanceof Error) {
        span.recordException(error);
      }
      throw error;
    } finally {
      span.end();
    }
  }

  private async attempt<T>(
    method: HttpMethod,
    path: string,
    body: unknown | null,
    attemptNo: number,
  ): Promise<T> {
    const startedAt = this.clock.now().getTime();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);
    try {
      const res = await this.fetchImpl(`${this.config.baseUrl}${path}`, {
        method,
        headers: this.buildHeaders(),
        signal: controller.signal,
        // `exactOptionalPropertyTypes` forbids `body: undefined` outright, so
        // the key is only ever present when there is a body to send.
        ...(body === null ? {} : { body: JSON.stringify(body) }),
      });
      return await this.handleResponse<T>(res, path, attemptNo, startedAt);
    } catch (error) {
      if (error instanceof DomainError) {
        throw error;
      }
      this.logAttempt(path, null, attemptNo, startedAt, null);
      throw this.errorMapper.toDomainError(null);
    } finally {
      clearTimeout(timer);
    }
  }

  private async handleResponse<T>(
    res: Response,
    path: string,
    attemptNo: number,
    startedAt: number,
  ): Promise<T> {
    const json = await this.safeJson(res);
    this.logAttempt(path, res.status, attemptNo, startedAt, json);
    if (!res.ok) {
      throw this.errorMapper.toDomainError(res.status, json);
    }
    return json as T;
  }

  private buildHeaders(): Record<string, string> {
    const token = Buffer.from(
      `${this.config.keyId}:${this.config.keySecret}`,
    ).toString("base64");
    const headers: Record<string, string> = {
      "content-type": "application/json",
      authorization: `Basic ${token}`,
    };
    if (this.config.linkedAccountId !== null) {
      // Razorpay Route sub-merchant passthrough (§2.5 design table); unused
      // in the single-merchant demo flow but wired for completeness.
      headers["X-Razorpay-Account"] = this.config.linkedAccountId;
    }
    return headers;
  }

  private async safeJson(res: Response): Promise<unknown> {
    const text = await res.text();
    if (text.length === 0) {
      return null;
    }
    try {
      return JSON.parse(text) as unknown;
    } catch {
      return null;
    }
  }

  private logAttempt(
    path: string,
    status: number | null,
    attemptNo: number,
    startedAt: number,
    json: unknown,
  ): void {
    const ms = this.clock.now().getTime() - startedAt;
    const rzpId = this.extractId(json);
    const description = isRazorpayApiErrorBody(json)
      ? json.error.description
      : null;
    this.logger.info("rzp.call", {
      endpoint: path,
      status,
      attempt: attemptNo,
      ms,
      rzp_id: rzpId,
      error_description: description,
    });
  }

  private extractId(json: unknown): string | null {
    if (typeof json !== "object" || json === null || !("id" in json)) {
      return null;
    }
    const id = (json as Record<string, unknown>)["id"];
    return typeof id === "string" ? id : null;
  }
}
