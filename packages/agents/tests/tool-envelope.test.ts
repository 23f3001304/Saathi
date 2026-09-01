import { describe, expect, it } from "vitest";

import { AgentInstance } from "../src/shared/agent-instance.js";
import type { ToolCall } from "../src/shared/tool-envelope.js";
import { argsHashOf } from "../src/shared/tool-envelope.js";
import { ToolEnvelopeSigner } from "../src/shared/tool-envelope-signer.js";
import type { EnvelopeFailure } from "../src/shared/tool-envelope-verifier.js";
import {
  envelopeVerifierConfig,
  ToolEnvelopeVerifier,
} from "../src/shared/tool-envelope-verifier.js";
import {
  FakeClock,
  HmacMandateSigner,
  HmacMandateVerifier,
  SeqIds,
} from "./fakes.js";

const SERVER = "covenant_merchant";

const CALL: ToolCall = {
  tool: "quote_request",
  server: SERVER,
  args: { sku: "ASC-GC9-UK8", qty: 1, target_unit_paise: 189900 },
};

function build(startIso = "2026-08-31T09:14:02.113Z"): {
  signer: ToolEnvelopeSigner;
  verifier: ToolEnvelopeVerifier;
  clock: FakeClock;
} {
  const clock = new FakeClock(startIso);
  const instance = new AgentInstance(
    "buyer",
    "urn:covenant:user:9f3c",
    new SeqIds(),
  );
  const signer = new ToolEnvelopeSigner(
    new HmacMandateSigner(),
    clock,
    new SeqIds(),
    instance,
    { keyRole: "user", ttlSeconds: 120 },
  );
  const verifier = new ToolEnvelopeVerifier(
    new HmacMandateVerifier(),
    clock,
    envelopeVerifierConfig(SERVER, "user"),
  );
  return { signer, verifier, clock };
}

describe("AM2 tool envelope round trip", () => {
  it("verifies the call it was signed over", async () => {
    const { signer, verifier } = build();

    const envelope = await signer.sign(CALL);
    const result = await verifier.verify(envelope.jws, CALL);

    expect(result.ok).toBe(true);
    expect(result.ok && result.claims).toMatchObject({
      ap2_role: "buyer",
      tool: "quote_request",
      server: SERVER,
      args_hash: argsHashOf(CALL.args),
    });
    expect(result.ok && result.claims.caller).toMatch(
      /^urn:covenant:agent:buyer:/,
    );
  });

  it("hashes args canonically, so key order cannot change the envelope", async () => {
    const { signer, verifier } = build();

    const envelope = await signer.sign(CALL);
    const reordered: ToolCall = {
      ...CALL,
      args: { target_unit_paise: 189900, qty: 1, sku: "ASC-GC9-UK8" },
    };

    expect((await verifier.verify(envelope.jws, reordered)).ok).toBe(true);
  });
});

interface TamperRow {
  readonly name: string;
  readonly failure: EnvelopeFailure;
  readonly mutate: (jws: string) => { jws: string; call: ToolCall };
}

const TAMPERS: readonly TamperRow[] = [
  {
    name: "a repriced argument",
    failure: "args_tampered",
    mutate: (jws) => ({
      jws,
      call: { ...CALL, args: { ...CALL.args, target_unit_paise: 1 } },
    }),
  },
  {
    name: "the envelope replayed onto another tool",
    failure: "tool_mismatch",
    mutate: (jws) => ({ jws, call: { ...CALL, tool: "catalog_search" } }),
  },
  {
    name: "the envelope replayed onto another server",
    failure: "server_mismatch",
    mutate: (jws) => ({ jws, call: { ...CALL, server: "covenant_gateway" } }),
  },
  {
    name: "a flipped signature byte",
    failure: "signature_invalid",
    mutate: (jws) => ({
      jws: `${jws.slice(0, -1)}${jws.endsWith("A") ? "B" : "A"}`,
      call: CALL,
    }),
  },
  {
    name: "a rewritten payload",
    failure: "signature_invalid",
    mutate: (jws) => {
      const [header, , signature] = jws.split(".");
      const forged = Buffer.from(
        JSON.stringify({ tool: "execute_payment" }),
        "utf8",
      ).toString("base64url");
      return { jws: `${header}.${forged}.${signature}`, call: CALL };
    },
  },
];

describe("AM2 tool envelope tamper detection", () => {
  it.each(TAMPERS)("rejects $name as $failure", async (row) => {
    const { signer, verifier } = build();
    const envelope = await signer.sign(CALL);

    const mutated = row.mutate(envelope.jws);
    const result = await verifier.verify(mutated.jws, mutated.call);

    expect(result.ok).toBe(false);
    expect(!result.ok && result.failure).toBe(row.failure);
  });
});

describe("AM2 tool envelope freshness and role", () => {
  it("expires an envelope once its TTL has passed", async () => {
    const { signer, verifier, clock } = build();
    const envelope = await signer.sign(CALL);

    clock.advance(121_000);
    const result = await verifier.verify(envelope.jws, CALL);

    expect(!result.ok && result.failure).toBe("expired");
  });

  it("refuses a merchant-keyed envelope where a buyer one is expected", async () => {
    const { verifier } = build();
    const clock = new FakeClock("2026-08-31T09:14:02.113Z");
    const merchantSigner = new ToolEnvelopeSigner(
      new HmacMandateSigner(),
      clock,
      new SeqIds(),
      new AgentInstance(
        "merchant",
        "urn:covenant:merchant:kolam-run",
        new SeqIds(),
      ),
      { keyRole: "merchant", ttlSeconds: 120 },
    );

    const envelope = await merchantSigner.sign(CALL);
    const result = await verifier.verify(envelope.jws, CALL);

    expect(!result.ok && result.failure).toBe("signature_invalid");
  });
});
