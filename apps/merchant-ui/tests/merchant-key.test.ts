import { beforeEach, describe, expect, it } from "vitest";

import {
  baseStringOf,
  heldKey,
  holdKeyFile,
  releaseKey,
  signatureHeader,
} from "../src/api/merchantKey.ts";

const KID = "merchant-2026-08-479bb8bf";

async function jwkFile(kid: string, patch: Record<string, unknown> = {}) {
  const pair = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  );
  const jwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
  const body = JSON.stringify({ ...jwk, kid, alg: "ES256", ...patch });
  return new File([body], `${kid}.private.jwk.json`, {
    type: "application/json",
  });
}

beforeEach(() => {
  releaseKey();
});

describe("custody of the shop's signing key", () => {
  it("takes the key file onboarding wrote and never asks again for text", async () => {
    const held = await holdKeyFile(
      await jwkFile(KID),
      "kolam-run",
      [KID],
      false,
    );

    expect(held.kid).toBe(KID);
    expect(heldKey()?.kid).toBe(KID);
  });

  it("refuses a key the pinned ring does not list for this shop", async () => {
    await expect(
      holdKeyFile(
        await jwkFile("merchant-someone-else"),
        "kolam-run",
        [KID],
        false,
      ),
    ).rejects.toThrow(/does not belong to this shop/i);
  });
});

describe("keys this shop must refuse", () => {
  it("refuses a file that is not a merchant key at all", async () => {
    await expect(
      holdKeyFile(
        await jwkFile("user-2026-08-86dc5ba2"),
        "kolam-run",
        [KID],
        false,
      ),
    ).rejects.toThrow(/not a shop signing key/i);
  });

  it("refuses a public half, which cannot sign anything", async () => {
    await expect(
      holdKeyFile(
        await jwkFile(KID, { d: undefined }),
        "kolam-run",
        [KID],
        false,
      ),
    ).rejects.toThrow(/not a signing key/i);
  });
});

describe("what a held key can and cannot do", () => {
  it("imports non-extractably, so the page cannot read the key back out", async () => {
    await holdKeyFile(await jwkFile(KID), "kolam-run", [KID], false);
    const key = heldKey();

    expect(key?.key.extractable).toBe(false);
    await expect(crypto.subtle.exportKey("jwk", key!.key)).rejects.toThrow();
  });

  it("signs nothing once the key is released", async () => {
    await holdKeyFile(await jwkFile(KID), "kolam-run", [KID], false);
    releaseKey();

    await expect(
      signatureHeader({
        method: "PATCH",
        path: "/v1/merchant/items/item_x",
        timestamp: "2026-08-31T13:00:00.000Z",
        idempotencyKey: "idem",
        rawBody: "{}",
      }),
    ).rejects.toThrow(/holds no signing key/i);
  });
});

describe("what a signature is over", () => {
  it("binds method, path, timestamp and idempotency key to the body hash", async () => {
    const base = {
      method: "PATCH",
      path: "/v1/merchant/items/item_x",
      timestamp: "2026-08-31T13:00:00.000Z",
      idempotencyKey: "idem",
      rawBody: "{}",
    };
    const line = await baseStringOf(base);
    const elsewhere = await baseStringOf({
      ...base,
      path: "/v1/merchant/items",
    });

    expect(line.split("\n")).toHaveLength(5);
    expect(line).not.toBe(elsewhere);
  });
});
