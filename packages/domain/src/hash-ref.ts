/** Bare lowercase SHA-256 hex — what the DDL stores (`length = 64`, §3.2). */
export type Sha256Hex = string;

/**
 * Prefixed hash reference — what crosses the wire and what a mandate signs
 * (`sha256:<64 lowercase hex>`, §6.1).
 */
export type Sha256Ref = string;

export const SHA256_REF_PREFIX = "sha256:";

const SHA256_HEX_PATTERN = /^[0-9a-f]{64}$/;
const SHA256_REF_PATTERN = /^sha256:[0-9a-f]{64}$/;

export function isSha256Hex(value: string): boolean {
  return SHA256_HEX_PATTERN.test(value);
}

export function isSha256Ref(value: string): boolean {
  return SHA256_REF_PATTERN.test(value);
}

export function toSha256Ref(hex: Sha256Hex): Sha256Ref {
  if (!isSha256Hex(hex)) {
    throw new RangeError(`Not a lowercase sha256 hex digest: "${hex}"`);
  }
  return `${SHA256_REF_PREFIX}${hex}`;
}

export function sha256HexOf(ref: Sha256Ref): Sha256Hex {
  if (!isSha256Ref(ref)) {
    throw new RangeError(`Not a sha256 reference: "${ref}"`);
  }
  return ref.slice(SHA256_REF_PREFIX.length);
}
