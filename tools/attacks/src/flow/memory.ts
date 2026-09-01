import type { Reply } from "../http/acp-client.js";
import type { Harness } from "../harness.js";

export type SourceChannel =
  | "user_signed_mandate"
  | "user_confirmation"
  | "merchant_attestation"
  | "verified_api"
  | "untrusted_text";

export type MemoryType =
  | "constraint"
  | "preference"
  | "fact"
  | "episode"
  | "procedure";

export interface WriteSpec {
  readonly type: MemoryType;
  readonly tierClaim: "P0" | "P1" | "P2" | "P3";
  readonly content: Readonly<Record<string, unknown>>;
  readonly channel: SourceChannel;
  readonly sourceRef: string | null;
  readonly sig: string | null;
  readonly subject: string | null;
  readonly predicate: string | null;
  readonly userId: string;
  readonly tInvalid?: string | null;
}

export interface WriteOutcome {
  readonly status: string;
  readonly memoryId: string | null;
  readonly tierGranted: string | null;
  readonly reasonCode: string | null;
  readonly rule: string | null;
  readonly human: string | null;
  readonly eventId: string | null;
  readonly httpStatus: number;
  readonly reply: Reply;
}

function str(body: Readonly<Record<string, unknown>>, key: string): string | null {
  const value = body[key];
  return typeof value === "string" ? value : null;
}

export function writeBodyOf(
  harness: Harness,
  spec: WriteSpec,
  now: Date,
): Readonly<Record<string, unknown>> {
  return {
    type: spec.type,
    tier_claim: spec.tierClaim,
    content: spec.content,
    source_channel: spec.channel,
    source_ref: spec.sourceRef,
    sig: spec.sig,
    subject: spec.subject,
    predicate: spec.predicate,
    t_valid: now.toISOString(),
    t_invalid: spec.tInvalid ?? null,
    user_id: spec.userId,
    tenant_id: harness.tenantId,
  };
}

/** `POST /v1/memory/write` — the write gate. A rejection is a 200 (§4.6). */
export async function writeMemory(
  harness: Harness,
  spec: WriteSpec,
  now: Date = new Date(),
): Promise<WriteOutcome> {
  const reply = await harness.client.post(
    "/v1/memory/write",
    writeBodyOf(harness, spec, now),
  );
  return {
    status: str(reply.body, "status") ?? `http_${reply.status}`,
    memoryId: str(reply.body, "memory_id"),
    tierGranted: str(reply.body, "tier_granted"),
    reasonCode: str(reply.body, "reason_code"),
    rule: str(reply.body, "rule"),
    human: str(reply.body, "human"),
    eventId: str(reply.body, "event_id"),
    httpStatus: reply.status,
    reply,
  };
}

export interface Retrieval {
  readonly entryIds: readonly string[];
  readonly digest: string;
  readonly tierFloor: string;
  readonly quarantined: readonly string[];
}

export type ActionClass =
  | "chat"
  | "cart-construction"
  | "constraint-evaluation"
  | "price-history"
  | "recs-training";

interface EntryView {
  readonly id: string;
  readonly quarantined: boolean;
}

/** The only digest-minting path (§4.10): retrieval, in the act of building. */
export async function retrieveMemory(
  harness: Harness,
  userId: string,
  actionClass: ActionClass,
  query: string,
): Promise<Retrieval> {
  const reply = await harness.client.post("/v1/memory/retrieve", {
    query,
    action_class: actionClass,
    limit: 64,
    as_of: null,
    user_id: userId,
    tenant_id: harness.tenantId,
  });
  const entries = (reply.body["entries"] ?? []) as EntryView[];
  return {
    entryIds: entries.map((entry) => entry.id),
    digest: str(reply.body, "digest") ?? "",
    tierFloor: str(reply.body, "tier_floor") ?? "",
    quarantined: entries.filter((e) => e.quarantined).map((e) => e.id),
  };
}
