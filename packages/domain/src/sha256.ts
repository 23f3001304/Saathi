import { createHash } from "node:crypto";

import { canonicalize } from "./canonical-json.js";
import type { Sha256Hex, Sha256Ref } from "./hash-ref.js";
import { toSha256Ref } from "./hash-ref.js";

/** Lowercase hex SHA-256 of a UTF-8 string — what the DDL stores (§3.2). */
export function sha256Hex(input: string): Sha256Hex {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

/** SHA-256 over the RFC 8785 canonical form — every hash ref in §6.1. */
export function sha256Of(value: unknown): Sha256Hex {
  return sha256Hex(canonicalize(value));
}

/** The prefixed `sha256:<hex>` reference a mandate signs over (§6.1). */
export function sha256RefOf(value: unknown): Sha256Ref {
  return toSha256Ref(sha256Of(value));
}
