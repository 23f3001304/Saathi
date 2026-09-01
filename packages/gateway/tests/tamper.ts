import type { MandateRole } from "@covenant/domain";
import { sha256Hex } from "@covenant/domain";
import type { IssuedMandate } from "@covenant/mandates";

import type { Crypto } from "./mandate-harness.js";

type Claims = Record<string, unknown>;

function payloadOf(jwt: string): Claims {
  const segment = jwt.split(".")[1] ?? "";
  return JSON.parse(Buffer.from(segment, "base64url").toString("utf8")) as Claims;
}

/**
 * Re-signs a mutated credential with a **genuine** key. The point of an attack
 * fixture is that the signature is real: a tampered blob that fails at the
 * signature proves nothing about the checks that come after it.
 */
export async function resignWith(
  crypto: Crypto,
  original: IssuedMandate,
  role: MandateRole,
  mutate: (subject: Claims) => void,
): Promise<IssuedMandate> {
  const payload = payloadOf(original.jwt);
  const vc = { ...(payload["vc"] as Claims) };
  const subject = { ...(vc["credentialSubject"] as Claims) };
  mutate(subject);
  vc["credentialSubject"] = subject;
  const jwt = await crypto.signer.sign({ ...payload, vc }, role);
  return {
    jwt,
    jti: original.jti,
    jwtHash: sha256Hex(jwt),
    payload: original.payload,
  };
}
