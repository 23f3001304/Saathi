import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { DomainError, isKid, roleOfKid } from "@covenant/domain";

import type { TrustRing } from "../src/index.js";
import {
  JwksLoader,
  PinnedJwkResolver,
  generateAndWrite,
  hasLiveKidPerRole,
} from "../src/index.js";
import { FixedClock, RecordingLogger } from "./doubles.js";
import { ISSUERS, NOW, USER_URN } from "./fixtures.js";

let keyDir: string;
let loader: JwksLoader;
let ring: TrustRing;

beforeAll(async () => {
  keyDir = mkdtempSync(join(tmpdir(), "covenant-keys-"));
  await generateAndWrite(keyDir, NOW, ISSUERS);
  loader = new JwksLoader(keyDir, new RecordingLogger());
  ring = loader.loadTrustRing();
});

afterAll(() => {
  rmSync(keyDir, { recursive: true, force: true });
});

describe("keys:gen file layout", () => {
  it.each(["user", "merchant", "gateway"])(
    "writes a public jwks and a private jwk for %s",
    (role) => {
      const jwks = readFileSync(
        join(keyDir, "jwks", `${role}.jwks.json`),
        "utf8",
      );
      const priv = readFileSync(
        join(keyDir, "private", `${role}.private.jwk.json`),
        "utf8",
      );
      expect((JSON.parse(jwks) as { keys: unknown[] }).keys).toHaveLength(1);
      expect(JSON.parse(priv)).toHaveProperty("d");
    },
  );

  it("mints one kid per role in the <role>-<yyyy-mm>-<8 hex> form", () => {
    const kids = ring.keys.map((key) => key.kid);
    expect(kids).toHaveLength(3);
    expect(kids.every((kid) => isKid(kid))).toBe(true);
    expect(kids.map((kid) => roleOfKid(kid)).sort()).toEqual([
      "gateway",
      "merchant",
      "user",
    ]);
    expect(kids.every((kid) => kid.includes("-2026-08-"))).toBe(true);
  });

  it("loads exactly the private roles present on disk", () => {
    expect(loader.loadKeyStore().roles().sort()).toEqual([
      "gateway",
      "merchant",
      "user",
    ]);
    expect(loader.loadKeyStore(["gateway"]).roles()).toEqual(["gateway"]);
  });
});

function resolverAt(instant: Date): PinnedJwkResolver {
  return new PinnedJwkResolver(ring, new FixedClock(instant));
}

function userKid(): string {
  return ring.issuers[USER_URN]?.kids[0] ?? "";
}

describe("pinned resolution", () => {
  it("resolves a pinned (iss, kid) pair to a P-256 signing key", () => {
    const jwk = resolverAt(NOW).resolve(USER_URN, userKid());
    expect(jwk?.role).toBe("user");
    expect(jwk?.crv).toBe("P-256");
    expect(jwk?.alg).toBe("ES256");
  });

  it.each([
    ["an unknown issuer", "urn:covenant:user:nobody", true],
    ["an unknown kid", USER_URN, false],
  ])("returns null for %s", (_name, iss, useRealKid) => {
    const kid = useRealKid ? userKid() : "user-2026-08-deadbeef";
    expect(resolverAt(NOW).resolve(iss, kid)).toBeNull();
  });

  it("returns null for a kid belonging to another issuer", () => {
    const merchantKid = ring.issuers[ISSUERS.merchant]?.kids[0] ?? "";
    expect(resolverAt(NOW).resolve(USER_URN, merchantKid)).toBeNull();
  });

  it("stops resolving a kid past not_after", () => {
    const later = new Date(NOW.getTime() + 366 * 24 * 3600 * 1000);
    expect(resolverAt(later).resolve(USER_URN, userKid())).toBeNull();
    expect(hasLiveKidPerRole(ring, later)).toBe(false);
    expect(hasLiveKidPerRole(ring, NOW)).toBe(true);
  });
});

describe("fail-closed loading", () => {
  it("refuses a missing trust ring", () => {
    const empty = mkdtempSync(join(tmpdir(), "covenant-empty-"));
    expect(() =>
      new JwksLoader(empty, new RecordingLogger()).loadTrustRing(),
    ).toThrow(DomainError);
    rmSync(empty, { recursive: true, force: true });
  });

  it("refuses an unparseable trust ring", () => {
    const broken = mkdtempSync(join(tmpdir(), "covenant-broken-"));
    writeFileSync(join(broken, "trust-ring.json"), "{ not json", "utf8");
    expect(() =>
      new JwksLoader(broken, new RecordingLogger()).loadTrustRing(),
    ).toThrow(DomainError);
    rmSync(broken, { recursive: true, force: true });
  });
});
