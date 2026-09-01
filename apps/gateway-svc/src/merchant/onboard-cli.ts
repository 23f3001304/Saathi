import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { Money } from "@covenant/domain";
import {
  PUBLIC_JWKS_DIR,
  TRUST_RING_FILE,
  parseTrustRing,
} from "@covenant/mandates";
import type { TrustRing } from "@covenant/mandates";

import { loadConfig } from "../config.js";
import { SystemClock } from "../adapters/system-ports.js";
import { wireObservability } from "../wiring/obs-wiring.js";
import { wireItems } from "../wiring/items-wiring.js";
import type { MerchantProfile, OnboardedMerchant } from "./onboarding.js";
import { onboardMerchant } from "./onboarding.js";
import { readProfile } from "./profile-file.js";

/** The merchant's own private key: theirs to hold, never the gateway's to load. */
export const MERCHANT_KEY_DIR = "merchants";

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
}

function readRing(keyDir: string): TrustRing {
  return parseTrustRing(
    JSON.parse(readFileSync(join(keyDir, TRUST_RING_FILE), "utf8")) as unknown,
  );
}

/**
 * The ring, the merchant's public JWKS and the merchant's private JWK, written
 * to three different places so that committing the wrong one is a visible diff
 * — the same layout `keys:gen` established.
 */
function writeOnboarded(keyDir: string, result: OnboardedMerchant): string {
  mkdirSync(join(keyDir, MERCHANT_KEY_DIR), { recursive: true });
  writeJson(join(keyDir, TRUST_RING_FILE), result.ring);
  writeJson(join(keyDir, PUBLIC_JWKS_DIR, "merchant.jwks.json"), {
    keys: result.ring.keys.filter((key) => key.kid.startsWith("merchant-")),
  });
  const keyPath = join(
    keyDir,
    MERCHANT_KEY_DIR,
    `${result.slug}.private.jwk.json`,
  );
  writeJson(keyPath, result.privateKeyJwk);
  return keyPath;
}

function report(result: OnboardedMerchant, keyPath: string): string {
  return [
    `merchant:onboard enrolled ${result.displayName}`,
    `  issuer   ${result.issuer}`,
    `  kid      ${result.kid} (valid until ${result.notAfter})`,
    `  key      ${keyPath} — hand it to the merchant, then delete this copy`,
    `  items    ${result.items.map((item) => item.itemId).join(", ") || "none"}`,
    "",
    "  The running gateway pinned its trust ring at boot and will not see this",
    "  kid until it is restarted. Until then this merchant's quotes verify as",
    "  SIGNER_UNKNOWN, which is the ring working, not the ring failing.",
    "",
  ].join("\n");
}

export async function main(argv: readonly string[]): Promise<void> {
  const profilePath = argv[0];
  if (profilePath === undefined) {
    process.stdout.write(usage());
    process.exitCode = 1;
    return;
  }
  const config = loadConfig(process.env);
  const obs = wireObservability(config);
  const clock = new SystemClock();
  const profile = readProfile(profilePath);
  const result = await onboardMerchant(
    readRing(config.keyDir),
    profile,
    wireItems(config, obs, clock),
    clock.now(),
  );
  process.stdout.write(report(result, writeOnboarded(config.keyDir, result)));
}

function usage(): string {
  return [
    "usage: pnpm merchant:onboard <profile.json>",
    "",
    '  { "slug": "nilgiri-weaves", "display_name": "Nilgiri Weaves",',
    '    "items": [{ "name": "...", "description": "...",',
    '                "amount_paise": 129900, "currency": "INR" }] }',
    "",
    `  Amounts are integer paise. ${Money.fromPaise(129900, "INR").toString()} is 129900.`,
    "",
  ].join("\n");
}

export type { MerchantProfile };

if (process.argv[1]?.endsWith("onboard-cli.js") === true) {
  await main(process.argv.slice(2));
}
