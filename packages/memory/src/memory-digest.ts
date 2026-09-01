import type { MemoryEntry, Sha256Hex, Sha256Ref } from "@covenant/domain";
import {
  MEMORY_DIGEST_ALG,
  canonicalize,
  sha256Hex,
  toCanonicalForm,
  toSha256Ref,
} from "@covenant/domain";

export { MEMORY_DIGEST_ALG };

/**
 * `covenant-md-1` (§9.4). `entry_hash = sha256Hex(canonicalize(form))` over a
 * FIXED field list whose absent members are emitted as `null` — omitting one
 * would make `{a: null}` and `{}` hash identically and let a new field
 * silently rewrite history. The field list and its `null` discipline are
 * `domain`'s `toCanonicalForm`; the crypto is here.
 */
export function entryHashOf(entry: MemoryEntry): Sha256Hex {
  return sha256Hex(canonicalize(toCanonicalForm(entry)));
}

/**
 * `'sha256:' + sha256Hex(entryHashes.sort().join('\n'))`, byte-wise ascending
 * over the lowercase hex. Sorting the **hashes** — not the ids, not the
 * entries — is what makes the digest order-independent: the agent may list its
 * justifying memories in any order and the gateway recomputes the same value.
 *
 * `Array.prototype.sort` with no comparator orders by UTF-16 code unit, which
 * over `[0-9a-f]` is byte order.
 */
export function computeDigest(entries: readonly MemoryEntry[]): Sha256Ref {
  const hashes = entries.map(entryHashOf).sort();
  return toSha256Ref(sha256Hex(hashes.join("\n")));
}

/**
 * The injectable face of the two functions above — §2.4's `VerdictContext`
 * builder and `MemoryDigestCheck` receive it as a collaborator, and §9.4 rule
 * 5 wants those to be two independent computations over the same store.
 */
export class MemoryDigest {
  readonly alg = MEMORY_DIGEST_ALG;

  compute(entries: readonly MemoryEntry[]): Sha256Ref {
    return computeDigest(entries);
  }

  entryHash(entry: MemoryEntry): Sha256Hex {
    return entryHashOf(entry);
  }
}
