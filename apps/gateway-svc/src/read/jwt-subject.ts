/**
 * Reads the `credentialSubject` out of a stored compact JWS **without**
 * verifying it.
 *
 * That is safe here and only here: the row was written by
 * `VerifyCartCommitter` inside the verify transaction, which means the
 * signature, the role binding and the chain were all checked before it
 * existed. Re-verifying on a read would be a second, independently-drifting
 * trust decision about a credential the ledger already vouches for — and the
 * audit page's integrity claim is `chain_ok`, which *is* recomputed.
 */
export function decodeSubject(
  compactJws: string | null,
): Readonly<Record<string, unknown>> {
  if (compactJws === null) {
    return {};
  }
  const payload = compactJws.split(".")[1];
  if (payload === undefined) {
    return {};
  }
  try {
    const claims = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as unknown;
    return subjectOf(claims);
  } catch {
    return {};
  }
}

function asRecord(value: unknown): Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function subjectOf(claims: unknown): Readonly<Record<string, unknown>> {
  return asRecord(asRecord(asRecord(claims)["vc"])["credentialSubject"]);
}
