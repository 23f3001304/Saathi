import { readHeaders } from "@covenant/agents";
import type { IdGenerator, Logger } from "@covenant/domain";
import { z } from "zod";

/**
 * `reason_code` is nullish, not nullable: a passing seal is ledgered without
 * the key at all, and a client that demanded `null` there would refuse to read
 * exactly the eight-seal approval this whole run exists to produce.
 */
const verdict = z.object({
  check: z.string(),
  outcome: z.string(),
  reason_code: z
    .string()
    .nullish()
    .transform((value) => value ?? null),
});

const auditResponse = z.object({
  ok: z.literal(true),
  txn_id: z.string(),
  verdicts: z.array(verdict),
  memory_digest: z.string().nullable(),
  events: z.array(z.object({ id: z.number(), kind: z.string() })),
  chain_ok: z.boolean(),
});

export type AuditVerdict = z.infer<typeof verdict>;
export type AuditView = z.infer<typeof auditResponse>;

export interface GatewayReaderConfig {
  readonly baseUrl: string;
  readonly apiVersion: string;
  readonly timeoutMs: number;
}

/**
 * The read side of the gateway, from the agent's point of view.
 *
 * DECISION: the eight seals the demo reads out loud are fetched from
 * `GET /v1/audit/:txn_id` rather than kept from the agent's own `verify-cart`
 * response. Why: frontend R10 — the audit trail comes from the verifier, never
 * from the agent. An agent quoting its own copy of a verdict is an agent
 * quoting itself; quoting the gateway's assembled chain (`chain_ok` included)
 * is the version a judge can go and check.
 */
export class GatewayReader {
  constructor(
    private readonly fetchImpl: typeof fetch,
    private readonly ids: IdGenerator,
    private readonly logger: Logger,
    private readonly config: GatewayReaderConfig,
  ) {}

  async audit(txnId: string): Promise<AuditView | null> {
    const response = await this.fetchImpl(
      `${this.config.baseUrl}/v1/audit/${encodeURIComponent(txnId)}`,
      {
        headers: readHeaders(this.ids.uuid(), this.config.apiVersion),
        signal: AbortSignal.timeout(this.config.timeoutMs),
      },
    );
    const payload: unknown = await response.json().catch(() => null);
    const parsed = auditResponse.safeParse(payload);
    if (!parsed.success) {
      this.logger.warn("gateway.audit.unreadable", {
        txn_id: txnId,
        status: response.status,
        issues: parsed.error.issues.map((issue) => issue.path.join(".")),
      });
      return null;
    }
    return parsed.data;
  }
}

export function sealSummary(verdicts: readonly AuditVerdict[]): {
  seals: number;
  passed: number;
} {
  return {
    seals: verdicts.length,
    passed: verdicts.filter((item) => item.outcome === "pass").length,
  };
}
