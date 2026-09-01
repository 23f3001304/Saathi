import { createPrivateKey, createSign, randomUUID } from "node:crypto";

import type { MandateRole } from "@covenant/domain";
import { baseStringOf } from "@covenant/gateway";

import { API_VERSION } from "../../src/config.js";
import type { SmokeCrypto } from "./crypto.js";

export interface PostOptions {
  readonly role?: MandateRole;
  readonly idempotencyKey?: string;
}

function privateKeyOf(crypto: SmokeCrypto, role: MandateRole) {
  const jwk = crypto.keys.keyFor(role).jwk;
  return createPrivateKey({
    key: {
      kty: jwk["kty"],
      crv: jwk["crv"],
      x: jwk["x"],
      y: jwk["y"],
      d: jwk["d"],
    },
    format: "jwk",
  });
}

/**
 * Signs the §4.2 canonical base string — method, path, timestamp, idempotency
 * key, body hash — with ES256 in the JWS raw `r || s` encoding. Node defaults
 * to DER, and the gateway pins `ieee-p1363` precisely so an algorithm-agile
 * path cannot be steered from outside.
 */
export class AcpClient {
  constructor(
    private readonly baseUrl: string,
    private readonly crypto: SmokeCrypto,
  ) {}

  get(
    path: string,
    headers: Readonly<Record<string, string>> = {},
  ): Promise<Response> {
    return fetch(`${this.baseUrl}${path}`, {
      headers: {
        "Request-Id": randomUUID(),
        "API-Version": API_VERSION,
        ...headers,
      },
    });
  }

  post(
    path: string,
    body: unknown,
    options: PostOptions = {},
  ): Promise<Response> {
    return this.send("POST", path, body, options);
  }

  put(
    path: string,
    body: unknown,
    options: PostOptions = {},
  ): Promise<Response> {
    return this.send("PUT", path, body, options);
  }

  private send(
    method: "POST" | "PUT",
    path: string,
    body: unknown,
    options: PostOptions,
  ): Promise<Response> {
    const role = options.role ?? "user";
    const raw = JSON.stringify(body);
    const timestamp = new Date().toISOString();
    const idempotencyKey = options.idempotencyKey ?? randomUUID();
    return fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        "Request-Id": randomUUID(),
        "API-Version": API_VERSION,
        "Idempotency-Key": idempotencyKey,
        Timestamp: timestamp,
        Signature: this.signatureFor(role, {
          method,
          path,
          timestamp,
          idempotencyKey,
          rawBody: raw,
        }),
      },
      body: raw,
    });
  }

  private signatureFor(
    role: MandateRole,
    base: Parameters<typeof baseStringOf>[0],
  ): string {
    const signature = createSign("SHA256")
      .update(baseStringOf(base), "utf8")
      .sign({
        key: privateKeyOf(this.crypto, role),
        dsaEncoding: "ieee-p1363",
      });
    return `keyid=${this.crypto.keys.keyFor(role).kid},alg=ES256,sig=${signature.toString("base64url")}`;
  }
}
