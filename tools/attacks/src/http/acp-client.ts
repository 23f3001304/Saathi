import { randomUUID } from "node:crypto";

import { es256 } from "../crypto/jws.js";
import { sha256Hex } from "../crypto/hash.js";
import type { TrustRing } from "../crypto/trust-ring.js";
import type { MandateRole } from "../protocol.js";
import { API_VERSION, MANDATE_ALG } from "../protocol.js";

export interface Reply {
  readonly status: number;
  readonly idempotentReplay: boolean;
  readonly raw: string;
  readonly body: Readonly<Record<string, unknown>>;
}

export interface PostOptions {
  readonly role?: MandateRole;
  readonly idempotencyKey?: string;
  readonly apiVersion?: string;
}

interface SignatureBase {
  readonly method: string;
  readonly path: string;
  readonly timestamp: string;
  readonly idempotencyKey: string;
  readonly rawBody: string;
}

/**
 * §4.2 verbatim: method, path, timestamp, idempotency key, body hash. A
 * body-only signature would be portable across paths and time, so a captured
 * `verify-cart` body could be replayed at `execute-payment`; T-31 replays the
 * *credential*, which is the attack this binding leaves open on purpose.
 */
export function baseStringOf(base: SignatureBase): string {
  return [
    base.method,
    base.path,
    base.timestamp,
    base.idempotencyKey,
    sha256Hex(base.rawBody),
  ].join("\n");
}

function parseBody(raw: string): Readonly<Record<string, unknown>> {
  try {
    const parsed: unknown = raw === "" ? null : JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : { non_object_body: raw };
  } catch {
    return { unparseable_body: raw };
  }
}

async function replyOf(response: Response): Promise<Reply> {
  const raw = await response.text();
  return {
    status: response.status,
    idempotentReplay: response.headers.get("Idempotent-Replay") === "true",
    raw,
    body: parseBody(raw),
  };
}

/** The ACP transport, re-derived: five headers, ES256 over the base string. */
export class AcpClient {
  constructor(
    private readonly baseUrl: string,
    private readonly ring: TrustRing,
  ) {}

  async get(path: string): Promise<Reply> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      headers: { "Request-Id": randomUUID(), "API-Version": API_VERSION },
    });
    return replyOf(response);
  }

  async post(
    path: string,
    body: unknown,
    options: PostOptions = {},
  ): Promise<Reply> {
    const role = options.role ?? "user";
    const rawBody = JSON.stringify(body);
    const timestamp = new Date().toISOString();
    const idempotencyKey = options.idempotencyKey ?? randomUUID();
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Request-Id": randomUUID(),
        "API-Version": options.apiVersion ?? API_VERSION,
        "Idempotency-Key": idempotencyKey,
        Timestamp: timestamp,
        Signature: this.signatureFor(role, {
          method: "POST",
          path,
          timestamp,
          idempotencyKey,
          rawBody,
        }),
      },
      body: rawBody,
    });
    return replyOf(response);
  }

  private signatureFor(role: MandateRole, base: SignatureBase): string {
    const signature = es256(this.ring.privateKey(role), baseStringOf(base));
    return `keyid=${this.ring.kidFor(role)},alg=${MANDATE_ALG},sig=${signature}`;
  }
}
