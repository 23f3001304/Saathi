import type { Harness } from "./harness.js";
import { getJson } from "./harness.js";

export interface AuditVerdict {
  readonly check: string;
  readonly outcome: string;
  readonly reason_code: string | null;
}

export interface AuditView {
  readonly ok: boolean;
  readonly txn_id: string;
  readonly intent: unknown;
  readonly cart: unknown;
  readonly memory_digest: string | null;
  readonly verdicts: readonly AuditVerdict[];
  readonly events: readonly { readonly id: number; readonly kind: string }[];
  readonly chain_ok: boolean;
}

export interface LedgerFrame {
  readonly id: number;
  readonly kind: string;
  readonly actor: string;
  readonly payload: Readonly<Record<string, unknown>>;
}

export interface CovenantView {
  readonly constraints: readonly {
    readonly id: string;
    readonly predicate: string | null;
    readonly content: Readonly<Record<string, unknown>>;
  }[];
}

export function auditFor(harness: Harness, txnId: string): Promise<AuditView> {
  return getJson(
    `${harness.gateway.url}/v1/audit/${encodeURIComponent(txnId)}`,
  ) as Promise<AuditView>;
}

export async function ledgerFrames(
  harness: Harness,
): Promise<readonly LedgerFrame[]> {
  const body = (await getJson(
    `${harness.gateway.url}/v1/ledger/events?after=0&limit=1000`,
  )) as { frames: readonly LedgerFrame[] };
  return body.frames;
}

export function covenantView(harness: Harness): Promise<CovenantView> {
  return getJson(`${harness.gateway.url}/v1/covenant`) as Promise<CovenantView>;
}

export interface BrowsedMemory {
  readonly id: string;
  readonly tier: string;
  readonly quarantined: boolean;
  readonly subject: string | null;
  readonly source_channel: string;
  readonly content: Readonly<Record<string, unknown>>;
}

/** `chat` is the only action class that may see a quarantined row (§9.3). */
export async function browseMemory(
  harness: Harness,
): Promise<readonly BrowsedMemory[]> {
  const body = (await getJson(
    `${harness.gateway.url}/v1/memory?action_class=chat&limit=200`,
  )) as { entries: readonly BrowsedMemory[] };
  return body.entries;
}

/** The signed allowance, read back from the gateway's live P3 constraints. */
export function signedCapPaise(view: CovenantView): number | null {
  const allowance = view.constraints.find(
    (entry) => entry.predicate === "allowance",
  );
  const value = allowance?.content["allowance"];
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const max = (value as Record<string, unknown>)["max_amount"];
  return typeof max === "number" ? max : null;
}
