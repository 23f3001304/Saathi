import type { Harness } from "../harness.js";

export interface LaneItem {
  readonly seq: number;
  readonly ts: string;
  readonly kind: string;
  readonly reason_code: string | null;
  readonly attack_id: string | null;
  readonly human: string | null;
  readonly txn_id: string | null;
}

export interface LedgerFrame {
  readonly id: number;
  readonly kind: string;
  readonly txn_id: string | null;
  readonly this_hash: string;
  readonly payload: unknown;
}

/**
 * `GET /audit?lane=attacks` is the cold-load backfill for the attack lane
 * (§4.10). Attack-class events ride the ordinary ledger with no side channel,
 * which is what makes "it was blocked" a claim the chain can be re-verified
 * against rather than a sentence the harness printed about itself.
 */
export async function attackLane(
  harness: Harness,
  limit = 100,
): Promise<readonly LaneItem[]> {
  const reply = await harness.client.get(`/v1/audit?lane=attacks&limit=${limit}`);
  return (reply.body["items"] ?? []) as LaneItem[];
}

export async function findLaneItem(
  harness: Harness,
  match: (item: LaneItem) => boolean,
): Promise<LaneItem | null> {
  const items = await attackLane(harness);
  return items.find(match) ?? null;
}

const ABSENT: LaneItem = {
  seq: -1,
  ts: "",
  kind: "-",
  reason_code: "-",
  attack_id: null,
  human: "-",
  txn_id: null,
};

export interface LaneReporter {
  detail(label: string, value: string): void;
}

/**
 * Every attack ends the same way: find its row in the ledger's own attack lane
 * and print the seq that proves the block was recorded. Shared so the three
 * scripts cannot drift on what counts as proof.
 */
export async function laneProof(
  harness: Harness,
  reporter: LaneReporter,
  attackId: string,
): Promise<LaneItem | null> {
  const lane = await findLaneItem(harness, (item) => item.attack_id === attackId);
  const item = lane ?? ABSENT;
  reporter.detail("attack lane seq", lane === null ? "(not found)" : String(item.seq));
  reporter.detail("kind", item.kind);
  reporter.detail("reason_code", item.reason_code ?? "-");
  reporter.detail("human", item.human ?? "-");
  return lane;
}

export function laneSeq(lane: LaneItem | null): number | null {
  return lane === null ? null : lane.seq;
}

/** The frame as the audit UI receives it, fetched by its own `seq`. */
export async function frameAt(
  harness: Harness,
  seq: number,
): Promise<LedgerFrame | null> {
  const reply = await harness.client.get(
    `/v1/ledger/events?after=${Math.max(0, seq - 1)}&limit=1`,
  );
  const frames = (reply.body["frames"] ?? []) as LedgerFrame[];
  return frames[0] ?? null;
}

export async function ledgerHeight(harness: Harness): Promise<number> {
  const reply = await harness.client.get("/v1/ledger/head");
  const height = reply.body["height"];
  return typeof height === "number" ? height : 0;
}

export interface ChainProof {
  readonly ok: boolean;
  readonly height: number;
}

/** A full hash-chain scan: the block is only proved if the chain still holds. */
export async function verifyChain(harness: Harness): Promise<ChainProof> {
  const reply = await harness.client.post("/v1/ledger/verify", {});
  return {
    ok: reply.body["ok"] === true,
    height: typeof reply.body["height"] === "number" ? reply.body["height"] : 0,
  };
}
