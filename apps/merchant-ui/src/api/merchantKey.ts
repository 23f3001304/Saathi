// Custody of the merchant's own signing key, and the ACP signature it makes.
//
// DECISION: the key stays on the merchant's device and the host never holds a
// copy that can sign for them.
//
// The obvious alternative was to move signing to the gateway: the shopkeeper
// signs in, the host signs the write with the key `merchant:onboard` left in
// `keys/merchants/<slug>.private.jwk.json`, and the JWK never appears in a
// browser at all. That was rejected. The signature on an inventory write is
// the only evidence in the system that the *shop* agreed to a change rather
// than someone with a session cookie, and a host that both signs and verifies
// it proves nothing by doing either. Better a real signature the merchant
// makes than a ceremony the host performs on their behalf.
//
// What was wrong was never the signature. It was making a human paste key
// material into a textarea, every tab, forever. So: the key arrives once, as
// the file onboarding wrote, through a file picker — never the clipboard — is
// imported non-extractable, and is remembered as a `CryptoKey` handle (see
// keyStore.ts). The shopkeeper meets a JWK once and then never again.
//
// The cost, stated plainly: a remembered handle is usable by any script on
// this origin, without a further gesture, until it is forgotten. The old
// module-variable custody died with the tab. This is a real weakening in
// exchange for a product a shopkeeper can actually use, and `forgetKey()` is
// on the settings page because of it.
import { forgetStoredKey, recallKey, rememberKey } from "./keyStore.ts";

const ALG = { name: "ECDSA", namedCurve: "P-256" } as const;

const SIGN_PARAMS = { name: "ECDSA", hash: "SHA-256" } as const;

export type HeldKey = { kid: string; key: CryptoKey; remembered: boolean };

let held: HeldKey | null = null;

export function heldKey(): HeldKey | null {
  return held;
}

function subtle(): SubtleCrypto {
  const api = globalThis.crypto?.subtle;
  if (api === undefined) {
    throw new Error(
      "This page is not on a secure connection, so it cannot hold a signing key.",
    );
  }
  return api;
}

type PrivateJwk = { kid?: string; d?: string; kty?: string; crv?: string };

/**
 * The kid must be one the pinned ring lists for *this* shop. Without that
 * check a shopkeeper could open one shop's console and unlock it with another
 * shop's key, and every write would then be signed by a merchant who never
 * saw the screen.
 */
function kidOf(jwk: PrivateJwk, kids: readonly string[]): string {
  if (jwk.kty !== "EC" || jwk.crv !== "P-256" || jwk.d === undefined) {
    throw new Error("That file is not a signing key.");
  }
  const kid = jwk.kid;
  if (kid === undefined || !kid.startsWith("merchant-")) {
    throw new Error("That is not a shop signing key.");
  }
  if (!kids.includes(kid)) {
    throw new Error("That key does not belong to this shop.");
  }
  return kid;
}

async function importJwk(jwk: PrivateJwk, kid: string): Promise<HeldKey> {
  // Non-extractable: once imported this page can sign with it and do nothing
  // else — it cannot read the key back out to send it anywhere.
  const key = await subtle().importKey("jwk", jwk as JsonWebKey, ALG, false, [
    "sign",
  ]);
  return { kid, key, remembered: false };
}

/**
 * `merchant:onboard` writes the file; the shopkeeper picks it once. The text
 * is parsed here and never stored: what persists is the handle, not the JWK.
 */
export async function holdKeyFile(
  file: File,
  slug: string,
  kids: readonly string[],
  remember: boolean,
): Promise<HeldKey> {
  const jwk = JSON.parse(await file.text()) as PrivateJwk;
  const imported = await importJwk(jwk, kidOf(jwk, kids));
  const stored =
    remember &&
    (await rememberKey({ slug, kid: imported.kid, key: imported.key }));
  held = { ...imported, remembered: stored };
  return held;
}

/** What this device already holds for a shop, if anything. */
export async function restoreKey(slug: string): Promise<HeldKey | null> {
  if (held !== null) return held;
  const found = await recallKey(slug);
  if (found === null) return null;
  held = { kid: found.kid, key: found.key, remembered: true };
  return held;
}

/** Lock this tab but leave the device's key in place. */
export function releaseKey(): void {
  held = null;
}

/** Forget it here entirely. The ring still lists the kid; this device stops
 *  being able to use it. */
export async function forgetKey(slug: string): Promise<void> {
  held = null;
  await forgetStoredKey(slug);
}

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function base64url(bytes: ArrayBuffer): string {
  const binary = String.fromCharCode(...new Uint8Array(bytes));
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await subtle().digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return hex(new Uint8Array(digest));
}

export type SigningBase = {
  method: string;
  path: string;
  timestamp: string;
  idempotencyKey: string;
  rawBody: string;
};

/**
 * Method, path, timestamp and idempotency key are all bound, so a captured
 * item write cannot be replayed at another route or another minute. This is
 * the same base string `packages/gateway`'s `baseStringOf` builds; the gateway
 * verifies it against the pinned trust ring and nothing else.
 */
export async function baseStringOf(base: SigningBase): Promise<string> {
  return [
    base.method,
    base.path,
    base.timestamp,
    base.idempotencyKey,
    await sha256Hex(base.rawBody),
  ].join("\n");
}

export async function signatureHeader(base: SigningBase): Promise<string> {
  const key = held;
  if (key === null) {
    throw new Error("This device holds no signing key for this shop.");
  }
  const signature = await subtle().sign(
    SIGN_PARAMS,
    key.key,
    new TextEncoder().encode(await baseStringOf(base)),
  );
  return `keyid=${key.kid},alg=ES256,sig=${base64url(signature)}`;
}
