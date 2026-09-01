import type { Clock, IdGenerator } from "@covenant/domain";
import type { z } from "zod";

import type { RequestSigner } from "./acp-headers.js";
import { acpHeaders, COVENANT_API_VERSION, signingBase } from "./acp-headers.js";
import type {
  CovenantSignResponse,
  ExecutePaymentResponse,
  MemoryRetrieveResponse,
  MemoryWriteResponse,
  VerifyCartResponse,
} from "./gateway-schemas.js";
import {
  covenantSignResponse,
  errorEnvelope,
  executePaymentResponse,
  memoryRetrieveResponse,
  memoryWriteResponse,
  verifyCartResponse,
} from "./gateway-schemas.js";

export type GatewayBody = Readonly<Record<string, unknown>>;

export interface GatewayFailure {
  readonly kind: "error_envelope" | "transport" | "schema";
  readonly reasonCode: string;
  readonly human: string;
  readonly toPass: GatewayBody | null;
  readonly status: number | null;
}

export type GatewayResult<T> =
  | { readonly ok: true; readonly value: T; readonly requestId: string }
  | { readonly ok: false; readonly failure: GatewayFailure };

export interface GatewayClientConfig {
  readonly baseUrl: string;
  readonly basePath: string;
  readonly apiVersion: string;
  readonly tenantId: string;
  readonly timeoutMs: number;
}

export const DEFAULT_GATEWAY_CONFIG: Omit<
  GatewayClientConfig,
  "baseUrl" | "tenantId"
> = {
  basePath: "/v1",
  apiVersion: COVENANT_API_VERSION,
  timeoutMs: 10_000,
};

/**
 * The single money egress (F2). Everything the agent can do to a rupee goes
 * through one class with one set of headers, so "the agent cannot bypass the
 * gateway" is a statement about one file rather than about a habit.
 */
export class GatewayClient {
  constructor(
    private readonly fetchImpl: typeof fetch,
    private readonly signer: RequestSigner,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
    private readonly config: GatewayClientConfig,
  ) {}

  verifyCart(body: GatewayBody): Promise<GatewayResult<VerifyCartResponse>> {
    return this.post("/verify-cart", body, verifyCartResponse);
  }

  executePayment(
    body: GatewayBody,
  ): Promise<GatewayResult<ExecutePaymentResponse>> {
    return this.post("/execute-payment", body, executePaymentResponse);
  }

  signCovenant(body: GatewayBody): Promise<GatewayResult<CovenantSignResponse>> {
    return this.post("/covenant/sign", body, covenantSignResponse);
  }

  writeMemory(body: GatewayBody): Promise<GatewayResult<MemoryWriteResponse>> {
    return this.post("/memory/write", body, memoryWriteResponse);
  }

  retrieveMemory(
    body: GatewayBody,
  ): Promise<GatewayResult<MemoryRetrieveResponse>> {
    return this.post("/memory/retrieve", body, memoryRetrieveResponse);
  }

  private async post<T>(
    route: string,
    body: GatewayBody,
    schema: z.ZodType<T>,
  ): Promise<GatewayResult<T>> {
    const request = await this.build(route, body);
    let response: Response;
    try {
      response = await this.fetchImpl(request.url, request.init);
    } catch (cause) {
      return transportFailure(cause);
    }
    return this.read(response, schema, request.requestId);
  }

  private async build(
    route: string,
    body: GatewayBody,
  ): Promise<{ url: string; init: RequestInit; requestId: string }> {
    const path = `${this.config.basePath}${route}`;
    const parts = {
      method: "POST",
      path,
      timestamp: this.clock.now().toISOString(),
      idempotencyKey: this.ids.uuid(),
      body: JSON.stringify({ tenant_id: this.config.tenantId, ...body }),
    };
    const requestId = this.ids.uuid();
    const signature = await this.signer.sign(signingBase(parts));
    const headers = acpHeaders({
      ...parts,
      requestId,
      signature,
      apiVersion: this.config.apiVersion,
    });
    const init: RequestInit = {
      method: "POST",
      headers,
      body: parts.body,
      signal: AbortSignal.timeout(this.config.timeoutMs),
    };
    return { url: `${this.config.baseUrl}${path}`, init, requestId };
  }

  private async read<T>(
    response: Response,
    schema: z.ZodType<T>,
    requestId: string,
  ): Promise<GatewayResult<T>> {
    const payload: unknown = await response.json().catch(() => null);
    const parsed = schema.safeParse(payload);
    if (parsed.success) {
      return { ok: true, value: parsed.data, requestId };
    }
    return { ok: false, failure: readFailure(payload, response.status) };
  }
}

function transportFailure(cause: unknown): GatewayResult<never> {
  const human = cause instanceof Error ? cause.message : "gateway unreachable";
  return {
    ok: false,
    failure: {
      kind: "transport",
      reasonCode: "GATEWAY_UNREACHABLE",
      human,
      toPass: null,
      status: null,
    },
  };
}

/** An unparseable 200 is a contract break, and it is reported as one. */
function readFailure(payload: unknown, status: number): GatewayFailure {
  const envelope = errorEnvelope.safeParse(payload);
  if (!envelope.success) {
    return {
      kind: "schema",
      reasonCode: "SCHEMA_VIOLATION",
      human: "The gateway answered in a shape this client does not accept.",
      toPass: null,
      status,
    };
  }
  const { error } = envelope.data;
  return {
    kind: "error_envelope",
    reasonCode: error.reason_code,
    human: error.human,
    toPass: error.to_pass,
    status,
  };
}
