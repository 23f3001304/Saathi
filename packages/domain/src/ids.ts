/**
 * Compile-time-distinct identifiers. A `TxnId` and a `MandateId` are both
 * strings at runtime, so only the brand stops one being passed where the other
 * is meant — the mix-up that a tenant-scoped, mandate-chained system cannot
 * afford to discover at 3 a.m. Shapes are §3.4 / §3.7 / §6.1.
 */

declare const ID_BRAND: unique symbol;

type Branded<Name extends string> = string & { readonly [ID_BRAND]: Name };

/** AM3: every row is tenant-scoped, so the tenant is never a bare string. */
export type TenantId = Branded<"TenantId">;
/** `txn_<uuid>` (§3.7). */
export type TxnId = Branded<"TxnId">;
/** `urn:uuid:<uuid>` — a mandate's primary key is its `jti` (§3.6, §6.1). */
export type MandateId = Branded<"MandateId">;
/** `mem_<uuid>` (§3.4). */
export type MemoryId = Branded<"MemoryId">;
/** `urn:uuid:<uuid>`. The `jti` **is** the nonce: one `jti`, one presentation. */
export type Jti = Branded<"Jti">;

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";

const PATTERNS = {
  TenantId: /^[a-z0-9][a-z0-9_-]{0,63}$/,
  TxnId: new RegExp(`^txn_${UUID}$`),
  MandateId: new RegExp(`^urn:uuid:${UUID}$`),
  MemoryId: new RegExp(`^mem_${UUID}$`),
  Jti: new RegExp(`^urn:uuid:${UUID}$`),
} as const;

type IdName = keyof typeof PATTERNS;

function matches(name: IdName, value: string): boolean {
  return PATTERNS[name].test(value);
}

function parse<Name extends IdName>(name: Name, value: string): Branded<Name> {
  if (!matches(name, value)) {
    throw new RangeError(`Not a ${name}: "${value}"`);
  }
  return value as Branded<Name>;
}

export const isTenantId = (v: string): v is TenantId => matches("TenantId", v);
export const isTxnId = (v: string): v is TxnId => matches("TxnId", v);
export const isMandateId = (v: string): v is MandateId =>
  matches("MandateId", v);
export const isMemoryId = (v: string): v is MemoryId => matches("MemoryId", v);
export const isJti = (v: string): v is Jti => matches("Jti", v);

export const toTenantId = (v: string): TenantId => parse("TenantId", v);
export const toTxnId = (v: string): TxnId => parse("TxnId", v);
export const toMandateId = (v: string): MandateId => parse("MandateId", v);
export const toMemoryId = (v: string): MemoryId => parse("MemoryId", v);
export const toJti = (v: string): Jti => parse("Jti", v);
