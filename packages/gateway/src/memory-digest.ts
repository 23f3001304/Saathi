import type { MemoryEntry, Sha256Hex, Sha256Ref } from "@covenant/domain";
import { sha256Hex, sha256Of, toCanonicalForm, toSha256Ref } from "@covenant/domain";

/**
 * `covenant-md-1` (§9.4), recomputed by the gateway at verification time from
 * the same fixed field list the read gate used at retrieval time. Two
 * independent computations over the store is what makes post-signing tampering
 * detectable, so this is a deliberate second implementation of the contract
 * `domain/memory-entry` states — not a call into `packages/memory`, whose
 * answer the gateway is supposed to be checking.
 */
export function entryHashOf(entry: MemoryEntry): Sha256Hex {
  return sha256Of(toCanonicalForm(entry));
}

/**
 * Sorting the **hashes** — not the ids, not the entries — is what makes the
 * digest order-independent: the agent may list its justifying memories in any
 * order and the gateway recomputes the same value. Sort is byte-wise ascending
 * over lowercase hex, joined with `\n`.
 */
export function computeDigest(entries: readonly MemoryEntry[]): Sha256Ref {
  const hashes = entries.map(entryHashOf).sort();
  return toSha256Ref(sha256Hex(hashes.join("\n")));
}
