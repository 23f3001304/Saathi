import type { MandateRole } from "@covenant/domain";

import type { MandateJwtPayload } from "../src/index.js";
import type { Harness } from "./fixtures.js";

type Claims = Record<string, unknown>;

function decode(segment: string): Claims {
  return JSON.parse(
    Buffer.from(segment, "base64url").toString("utf8"),
  ) as Claims;
}

function encode(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

export function payloadOf(jwt: string): Claims {
  return decode(jwt.split(".")[1] ?? "");
}

export function headerOf(jwt: string): Claims {
  return decode(jwt.split(".")[0] ?? "");
}

/** Rewrites the payload but keeps the original signature — the classic forgery. */
export function tamperPayload(jwt: string, patch: Claims): string {
  const [header, body, signature] = jwt.split(".");
  const claims = { ...decode(body ?? ""), ...patch };
  return `${header ?? ""}.${encode(claims)}.${signature ?? ""}`;
}

/** Rewrites a member of the credential subject, keeping the signature. */
export function tamperSubject(jwt: string, patch: Claims): string {
  const claims = payloadOf(jwt);
  const vc = claims["vc"] as Claims;
  const subject = vc["credentialSubject"] as Claims;
  return tamperPayload(jwt, {
    vc: { ...vc, credentialSubject: { ...subject, ...patch } },
  });
}

/** Re-signs a hand-edited payload, so the signature is real and the body is not. */
export function resignSubject(
  harness: Harness,
  jwt: string,
  role: MandateRole,
  patch: Claims,
): Promise<string> {
  const claims = payloadOf(jwt);
  const vc = claims["vc"] as Claims;
  const subject = vc["credentialSubject"] as Claims;
  return harness.signer.sign(
    { ...claims, vc: { ...vc, credentialSubject: { ...subject, ...patch } } },
    role,
  );
}

export function resignAs(
  harness: Harness,
  jwt: string,
  role: MandateRole,
): Promise<string> {
  return harness.signer.sign(payloadOf(jwt), role);
}

export function resignPayload(
  harness: Harness,
  payload: MandateJwtPayload,
  role: MandateRole,
): Promise<string> {
  return harness.signer.sign({ ...payload }, role);
}

/** `alg: none` must be rejected before `jose` is called at all (§6.1). */
export function unsignedAlgNone(jwt: string): string {
  const header = { ...headerOf(jwt), alg: "none" };
  return `${encode(header)}.${jwt.split(".")[1] ?? ""}.`;
}
