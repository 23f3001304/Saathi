import { GATEWAY_ISSUER } from "@covenant/domain";
import { describe, expect, it } from "vitest";

import { Es256Signer } from "../src/jwt/es256-signer.js";
import { Es256Verifier } from "../src/jwt/es256-verifier.js";
import { generateKeyMaterial } from "../src/keys/key-material.js";
import { KeyStore } from "../src/keys/key-store.js";
import { enrolIssuer } from "../src/keys/merchant-enrolment.js";
import { PinnedJwkResolver } from "../src/keys/pinned-jwk-resolver.js";
import { parseTrustRing } from "../src/keys/trust-ring.js";
import { FixedClock } from "./doubles.js";

const NOW = new Date("2026-08-31T09:14:02.113Z");
const NEW_MERCHANT = "urn:covenant:merchant:nilgiri-weaves";

async function devRing() {
  return generateKeyMaterial(
    {
      user: "urn:covenant:user:9f3c",
      merchant: "urn:covenant:merchant:kolam-run",
      gateway: GATEWAY_ISSUER,
    },
    NOW,
  );
}

describe("enrolling a merchant into the pinned trust ring", () => {
  it("adds an issuer and a kid without disturbing the ones already there", async () => {
    const material = await devRing();

    const enrolled = await enrolIssuer(
      material.trustRing,
      NEW_MERCHANT,
      "merchant",
      NOW,
    );

    expect(Object.keys(enrolled.ring.issuers)).toHaveLength(4);
    expect(enrolled.ring.keys).toHaveLength(4);
    expect(enrolled.ring.issuers[NEW_MERCHANT]?.kids).toEqual([enrolled.kid]);
    expect(
      enrolled.ring.issuers["urn:covenant:merchant:kolam-run"]?.kids,
    ).toEqual(
      material.trustRing.issuers["urn:covenant:merchant:kolam-run"]?.kids,
    );
  });
});

describe("the enrolled ring as the loader sees it", () => {
  it("parses under the loader's own fail-closed parser", async () => {
    const material = await devRing();

    const enrolled = await enrolIssuer(
      material.trustRing,
      NEW_MERCHANT,
      "merchant",
      NOW,
    );

    expect(() =>
      parseTrustRing(JSON.parse(JSON.stringify(enrolled.ring)) as unknown),
    ).not.toThrow();
  });
});

describe("the enrolled merchant's own key", () => {
  it("signs an attestation the gateway's pinned resolver verifies", async () => {
    const material = await devRing();
    const enrolled = await enrolIssuer(
      material.trustRing,
      NEW_MERCHANT,
      "merchant",
      NOW,
    );
    const clock = new FixedClock(NOW);
    const verifier = new Es256Verifier(
      new PinnedJwkResolver(enrolled.ring, clock),
      clock,
    );
    const signer = new Es256Signer(new KeyStore([enrolled.privateKey]));

    const jws = await signer.sign(
      {
        iss: NEW_MERCHANT,
        sub: NEW_MERCHANT,
        aud: "urn:covenant:gateway",
        jti: "urn:uuid:00000000-0000-4000-8000-000000000001",
        iat: Math.floor(NOW.getTime() / 1000),
        exp: Math.floor(NOW.getTime() / 1000) + 600,
        sku_id: "item_TWNIHOyaam98x4",
      },
      "merchant",
    );

    const verified = await verifier.verify(jws, {
      role: "merchant",
      audience: "urn:covenant:gateway",
      issuer: NEW_MERCHANT,
    });

    expect(verified.claims["sku_id"]).toBe("item_TWNIHOyaam98x4");
  });
});

describe("re-enrolment", () => {
  it("is refused, so a re-run cannot void quotes already signed", async () => {
    const material = await devRing();

    await expect(
      enrolIssuer(
        material.trustRing,
        "urn:covenant:merchant:kolam-run",
        "merchant",
        NOW,
      ),
    ).rejects.toThrow();
  });
});
