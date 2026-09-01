import type { SseFrame } from "./sse-stream.js";
import { readSseFrames } from "./sse-stream.js";

export type ProviderHeaders = Readonly<Record<string, string>>;

export interface ProviderHttpRequest {
  readonly url: string;
  readonly headers: ProviderHeaders;
  readonly body: unknown;
}

/**
 * A provider refused or could not be reached. `detail` carries the response
 * body, truncated; it never carries the request headers, because those hold
 * the API key and this error is going to end up in a log line.
 */
export class ProviderTransportError extends Error {
  readonly provider: string;
  readonly status: number | null;
  readonly detail: string;

  constructor(provider: string, status: number | null, detail: string) {
    super(`${provider} request failed${status === null ? "" : ` (${status})`}`);
    this.name = "ProviderTransportError";
    this.provider = provider;
    this.status = status;
    this.detail = detail;
  }
}

export const DEFAULT_PROVIDER_TIMEOUT_MS = 60_000;

const MAX_DETAIL_CHARS = 500;

export interface JsonTransportConfig {
  readonly provider: string;
  readonly timeoutMs: number;
}

/**
 * JSON over HTTP with an injected `fetch` — the same seam `GatewayClient`
 * uses, and the reason every provider adapter can be tested against a fake
 * wire without a network, a credential or a vendor SDK.
 */
export class JsonTransport {
  constructor(
    private readonly fetchImpl: typeof fetch,
    private readonly config: JsonTransportConfig,
  ) {}

  async post(request: ProviderHttpRequest): Promise<unknown> {
    return this.read(await this.send("POST", request));
  }

  /**
   * The same request, answered as `text/event-stream`. A refusal is still a
   * `ProviderTransportError` carrying the body, because a 401 arrives as a
   * whole response on either leg and reading it as a stream would only make
   * the message harder to find.
   */
  async postStream(
    request: ProviderHttpRequest,
  ): Promise<AsyncIterable<SseFrame>> {
    const response = await this.send("POST", {
      ...request,
      headers: { accept: "text/event-stream", ...request.headers },
    });
    if (!response.ok || response.body === null) {
      await this.read(response);
      throw new ProviderTransportError(
        this.config.provider,
        response.status,
        "response carried no stream",
      );
    }
    return readSseFrames(response.body);
  }

  /** Model discovery is the only GET any provider surface asks of us. */
  async get(url: string, headers: ProviderHeaders): Promise<unknown> {
    return this.read(await this.send("GET", { url, headers, body: null }));
  }

  private async read(response: Response): Promise<unknown> {
    const text = await response.text().catch(() => "");
    if (!response.ok) {
      throw new ProviderTransportError(
        this.config.provider,
        response.status,
        text.slice(0, MAX_DETAIL_CHARS),
      );
    }
    return this.parse(text, response.status);
  }

  private async send(
    method: "GET" | "POST",
    request: ProviderHttpRequest,
  ): Promise<Response> {
    try {
      return await this.fetchImpl(request.url, {
        method,
        headers: { "content-type": "application/json", ...request.headers },
        ...(method === "POST" ? { body: JSON.stringify(request.body) } : {}),
        signal: AbortSignal.timeout(this.config.timeoutMs),
      });
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : "unreachable";
      throw new ProviderTransportError(this.config.provider, null, detail);
    }
  }

  private parse(text: string, status: number): unknown {
    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw new ProviderTransportError(
        this.config.provider,
        status,
        `response was not JSON: ${text.slice(0, MAX_DETAIL_CHARS)}`,
      );
    }
  }
}
