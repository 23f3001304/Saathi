import type { NonceState, NonceToPass } from "@covenant/domain";
import { describe, expect, it } from "vitest";

import { NonceCheck } from "../../src/index.js";
import { goldenContext } from "../context.js";
import { TENANT } from "../fixtures.js";

const check = new NonceCheck();

function burned(tenantId: string): NonceState {
  return {
    nonce: "urn:uuid:22222222-2222-4222-8222-222222222222",
    purpose: "cart_verify",
    tenantId,
    payloadHash: "d".repeat(64),
    idempotencyKey: "key-0",
    burnedAt: "2026-08-31T09:50:00.000Z",
    burnEventId: "ev_4471",
    responseJson: "{}",
  };
}

describe("NonceCheck", () => {
  it("passes a mandate that has never been presented", () => {
    expect(check.run(goldenContext()).outcome).toBe("pass");
  });

  it("fails NONCE_BURNED and names the burn so the agent can reissue", () => {
    const verdict = check.run(
      goldenContext({ context: { nonceState: burned(TENANT) } }),
    );
    expect(verdict.outcome).toBe("fail");
    expect(verdict.reason_code).toBe("NONCE_BURNED");
    const toPass = verdict.to_pass as NonceToPass;
    expect(toPass.burn_event_id).toBe("ev_4471");
    expect(toPass.remedy).toBe("reissue_cart_mandate_with_new_jti");
  });

  it("discloses nothing about a burn that belongs to another tenant", () => {
    const verdict = check.run(
      goldenContext({ context: { nonceState: burned("tnt_other") } }),
    );
    expect(verdict.reason_code).toBe("TENANT_MISMATCH");
    expect(verdict.to_pass).toBeNull();
  });
});
