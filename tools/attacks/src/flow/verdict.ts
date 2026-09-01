import type { Harness } from "../harness.js";
import type { Reply } from "../http/acp-client.js";

export interface Seal {
  readonly check: string;
  readonly outcome: string;
  readonly reason_code: string | null;
  readonly human: string | null;
}

export interface VerdictReply {
  readonly httpStatus: number;
  readonly decision: string;
  readonly reasonCode: string | null;
  readonly human: string | null;
  readonly toPass: unknown;
  readonly seals: readonly Seal[];
  readonly txnId: string | null;
  readonly idempotentReplay: boolean;
  readonly reply: Reply;
}

function asRecord(value: unknown): Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

function str(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

/**
 * A verdict body and a §4.6 error envelope carry the same facts under
 * different roofs. Flattening the envelope under the body lets one reader
 * serve both: the body wins wherever they overlap, which they never do.
 */
export function verdictOf(reply: Reply): VerdictReply {
  const view = { ...asRecord(reply.body["error"]), ...reply.body };
  const decision = view["decision"] ?? view["type"] ?? `http_${reply.status}`;
  return {
    httpStatus: reply.status,
    decision: String(decision),
    reasonCode: str(view["reason_code"]),
    human: str(view["human"]),
    toPass: view["to_pass"] ?? null,
    seals: (view["verdicts"] ?? []) as Seal[],
    txnId: str(view["txn_id"]),
    idempotentReplay: reply.idempotentReplay,
    reply,
  };
}

export async function verifyCart(
  harness: Harness,
  body: unknown,
  idempotencyKey?: string,
): Promise<VerdictReply> {
  const reply = await harness.client.post(
    "/v1/verify-cart",
    body,
    idempotencyKey === undefined ? {} : { idempotencyKey },
  );
  return verdictOf(reply);
}
