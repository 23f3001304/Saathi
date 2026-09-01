import { createHash } from "node:crypto";

import { canonicalize } from "./canonical-json.js";

/** Lowercase hex SHA-256 of a UTF-8 string (§3.2). */
export function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

/** SHA-256 over the RFC 8785 canonical form — every hash ref in §6.1. */
export function sha256Of(value: unknown): string {
  return sha256Hex(canonicalize(value));
}

/** The prefixed `sha256:<hex>` reference a mandate signs over (§6.1). */
export function sha256RefOf(value: unknown): string {
  return `sha256:${sha256Of(value)}`;
}

export function toSha256Ref(hex: string): string {
  return `sha256:${hex}`;
}
