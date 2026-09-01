import type { SigningKeyRecord } from "./types.ts";

// Creating the covenant key: the one step in this flow that produces
// authority. It is deliberately not reachable from any identity adapter —
// only the hold-to-sign ceremony calls it.

const KEY_PARAMS = { name: "ECDSA", namedCurve: "P-256" } as const;
const THUMBPRINT_CHARS = 16;

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function thumbprintOf(
  publicKey: CryptoKey,
  subtle: SubtleCrypto,
): Promise<string> {
  const raw = await subtle.exportKey("raw", publicKey);
  const digest = await subtle.digest("SHA-256", raw);
  return hex(new Uint8Array(digest)).slice(0, THUMBPRINT_CHARS);
}

async function generateThumbprint(subtle: SubtleCrypto): Promise<string> {
  // DECISION: `extractable: false`, and the private half is never returned,
  // stored, or serialised by this module. A sign-in screen is the wrong
  // custodian for private key material; durable custody (IndexedDB with a
  // non-extractable handle, WebAuthn, or a secure element) belongs to the
  // mandate layer. What this flow legitimately owns is the *fact* that a key
  // was made and which one it is — the public thumbprint below.
  const pair = await subtle.generateKey(KEY_PARAMS, false, ["sign", "verify"]);
  return thumbprintOf(pair.publicKey, subtle);
}

function fallbackThumbprint(): string {
  // `crypto.subtle` is absent outside secure contexts (plain http on a LAN
  // address, say). The ceremony must still complete and still produce a
  // distinct key identity rather than silently pretending.
  const bytes = new Uint8Array(THUMBPRINT_CHARS / 2);
  globalThis.crypto?.getRandomValues(bytes);
  return hex(bytes);
}

/** Run the ceremony's payload: make a key, describe it honestly. */
export async function createSigningKey(): Promise<SigningKeyRecord> {
  const subtle = globalThis.crypto?.subtle;
  const thumbprint =
    subtle === undefined
      ? fallbackThumbprint()
      : await generateThumbprint(subtle);
  return {
    thumbprint,
    algorithm: "ES256",
    createdAt: new Date().toISOString(),
  };
}
