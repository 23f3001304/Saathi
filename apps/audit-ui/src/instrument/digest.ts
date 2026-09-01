// §2.5 O2 / D12 — client-side sha256, no server round trip. Pure functions
// so the golden-vector test doesn't need a rendered component.
export async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/** The digest is `sha256(sorted entry hashes)` — sorted so order never matters. */
export function concatenateSortedHashes(hashes: string[]): string {
  return [...hashes].sort().join("");
}

export async function computeMemoryDigest(hashes: string[]): Promise<string> {
  return sha256Hex(concatenateSortedHashes(hashes));
}
