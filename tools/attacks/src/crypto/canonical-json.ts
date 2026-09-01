/**
 * RFC 8785 (JCS), re-derived locally because the harness may import nothing
 * from `packages/`. Keys sort by UTF-16 code unit, no insignificant
 * whitespace, shortest round-trip number form.
 *
 * This is the single canonicalisation behind `cart_hash` (§6.3): if this file
 * and the gateway's disagree by one byte, every cart the harness signs fails
 * `CART_HASH_MISMATCH` — which is exactly the loud failure an independent
 * re-derivation should produce rather than a silent pass.
 */
export function canonicalize(value: unknown): string {
  return serialize(value);
}

function serialize(value: unknown): string {
  const json = unwrap(value);
  if (json === null) {
    return "null";
  }
  switch (typeof json) {
    case "boolean":
      return json ? "true" : "false";
    case "number":
      return serializeNumber(json);
    case "string":
      return JSON.stringify(json);
    case "object":
      return serializeComposite(json);
    default:
      throw new TypeError(`No JCS form for a value of type ${typeof json}`);
  }
}

/** `undefined` throws: absent members are emitted as `null`, never dropped. */
function unwrap(value: unknown): unknown {
  if (value === undefined) {
    throw new TypeError("undefined has no JCS form; emit null instead");
  }
  if (value === null || typeof value !== "object") {
    return value;
  }
  const candidate = (value as { toJSON?: unknown }).toJSON;
  return typeof candidate === "function"
    ? (candidate as () => unknown).call(value)
    : value;
}

function serializeNumber(value: number): string {
  if (!Number.isFinite(value)) {
    throw new RangeError(`Not a JSON number: ${String(value)}`);
  }
  return JSON.stringify(value);
}

function serializeComposite(value: object): string {
  return Array.isArray(value)
    ? `[${value.map((element) => serialize(element)).join(",")}]`
    : serializeObject(value as Record<string, unknown>);
}

function serializeObject(value: Record<string, unknown>): string {
  const members = Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${serialize(value[key])}`);
  return `{${members.join(",")}}`;
}
