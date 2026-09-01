import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { sha256Hex, concatenateSortedHashes, computeMemoryDigest } from "../src/instrument/digest.ts";
import { applyFrame, initialLedgerState } from "../src/ledger/reducer.ts";
import { happyPurchaseFrames, HAPPY_TXN_ID } from "../src/ledger/fixtures/happyPurchase.ts";

function nodeSha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

describe("sha256Hex", () => {
  it("agrees with Node's independent sha256 implementation on a golden vector", async () => {
    const golden = "sundar-textiles quotes a91f7c2d9b02c4e1";
    await expect(sha256Hex(golden)).resolves.toBe(nodeSha256Hex(golden));
  });

  it("agrees on the empty string too", async () => {
    await expect(sha256Hex("")).resolves.toBe(nodeSha256Hex(""));
  });
});

describe("concatenateSortedHashes", () => {
  it("sorts before concatenating, so input order never changes the digest", () => {
    expect(concatenateSortedHashes(["b", "a", "c"])).toBe("abc");
    expect(concatenateSortedHashes(["c", "b", "a"])).toBe("abc");
  });
});

describe("computeMemoryDigest", () => {
  it("D12 — is sha256 of the sorted-and-joined entry hashes, client-side", async () => {
    const hashes = ["7c2d9b02", "a91f4c2e", "4f1a9b02"];
    const expected = nodeSha256Hex(concatenateSortedHashes(hashes));
    await expect(computeMemoryDigest(hashes)).resolves.toBe(expected);
  });
});

describe("O2 against the happy-purchase fixture — the actual 3:00 demo beat", () => {
  it("recomputing over the txn's own justifying memories matches the cart's claimed digest", async () => {
    // Regression: this only passes if every memory kind that can justify a
    // cart — including a merchant's `catalog.quote.received` — actually
    // lands in `txn.memories`. It didn't (browser smoke test caught it),
    // which made the client-recomputed digest disagree with the claim on
    // the happy path itself.
    const state = happyPurchaseFrames().reduce(applyFrame, initialLedgerState);
    const txn = state.txns[HAPPY_TXN_ID];
    const justified = txn?.cart?.justified_by ?? [];
    const hashes = (txn?.memories ?? []).filter((m) => justified.includes(m.id)).map((m) => m.hash);
    expect(hashes).toHaveLength(justified.length);
    await expect(computeMemoryDigest(hashes)).resolves.toBe(txn?.cart?.memory_digest);
  });
});
