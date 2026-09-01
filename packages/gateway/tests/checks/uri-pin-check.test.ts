import type { UriPinToPass } from "@covenant/domain";
import {
  AP2_EXTENSION_URI,
  PINNED_CONTEXT_URIS,
  W3C_CREDENTIALS_CONTEXT,
} from "@covenant/domain";
import { describe, expect, it } from "vitest";

import { UriPinCheck } from "../../src/index.js";
import type { ContextOverrides } from "../context.js";
import { goldenContext } from "../context.js";

const check = new UriPinCheck();

const CASES: readonly (readonly [string, ContextOverrides])[] = [
  [
    "an older extension profile",
    { cart: { ap2_extension_uri: "https://covenant.dev/ns/ap2/v0.1" } },
  ],
  [
    "a newer extension profile",
    { cart: { ap2_extension_uri: "https://covenant.dev/ns/ap2/v2" } },
  ],
  [
    "an unknown host",
    { cart: { ap2_extension_uri: "https://evil.example/ns/ap2/v1" } },
  ],
  [
    "an extra @context entry",
    {
      context: {
        cartContexts: [...PINNED_CONTEXT_URIS, "https://evil.example/ctx"],
      },
    },
  ],
  [
    "a reordered @context whose first entry is not the W3C one",
    { context: { cartContexts: [AP2_EXTENSION_URI, W3C_CREDENTIALS_CONTEXT] } },
  ],
];

describe("UriPinCheck", () => {
  it("passes an exact match on the extension URI and every context", () => {
    expect(check.run(goldenContext()).outcome).toBe("pass");
  });

  it.each(CASES)("fails URI_DOWNGRADE on %s", (_name, overrides) => {
    const verdict = check.run(goldenContext(overrides));
    expect(verdict.outcome).toBe("fail");
    expect(verdict.reason_code).toBe("URI_DOWNGRADE");
  });

  it("names the expected URI so the merchant can upgrade", () => {
    const verdict = check.run(
      goldenContext({ cart: { ap2_extension_uri: "https://covenant.dev/ns/ap2/v0.1" } }),
    );
    const toPass = verdict.to_pass as UriPinToPass;
    expect(toPass.expected_uri).toBe(AP2_EXTENSION_URI);
    expect(toPass.received_uri).toBe("https://covenant.dev/ns/ap2/v0.1");
    expect(toPass.remedy).toBe("upgrade_extension_uri");
  });

  it("has no fallback profile: an empty URI is a downgrade, not a default", () => {
    expect(
      check.run(goldenContext({ cart: { ap2_extension_uri: "" } })).reason_code,
    ).toBe("URI_DOWNGRADE");
  });
});
