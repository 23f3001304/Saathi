// Shared builder for every fixture scenario — keeps each scenario file a
// plain list of `{actor, kind, txn_id, payload}` inputs and produces a
// properly hash-chained `LedgerFrame[]` matching §4.2 byte-for-byte.
import type { EventActor, EventKind, LedgerFrame } from "../types.ts";

export type FrameInput = {
  offsetMs: number;
  actor: EventActor;
  kind: EventKind;
  txn_id: string | null;
  payload: unknown;
};

// Cosmetic only — a real sha256 chain is the ledger package's job; fixtures
// just need hash-shaped strings so Hash/ChainChip render realistically.
export function hexHash(n: number): string {
  const word = Math.imul(n, 2654435761) >>> 0;
  return word.toString(16).padStart(8, "0").repeat(8).slice(0, 64);
}

export function iso(baseMs: number, offsetMs: number): string {
  return new Date(baseMs + offsetMs).toISOString();
}

export function buildFrames(
  baseMs: number,
  inputs: FrameInput[],
  startId = 1,
  startHash?: string,
): LedgerFrame[] {
  let prevHash = startHash ?? "0".repeat(64);
  return inputs.map((input, i) => {
    const id = startId + i;
    const thisHash = hexHash(id);
    const frame: LedgerFrame = {
      id,
      ts: iso(baseMs, input.offsetMs),
      actor: input.actor,
      kind: input.kind,
      txn_id: input.txn_id,
      payload: input.payload,
      prev_hash: prevHash,
      this_hash: thisHash,
    };
    prevHash = thisHash;
    return frame;
  });
}
