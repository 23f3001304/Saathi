/**
 * RFC 8785 (JCS) — the one canonicalization behind every hash in the system
 * (§6.1, §9.4). Object keys sort by UTF-16 code unit, there is no insignificant
 * whitespace, numbers take the shortest round-trip ECMAScript form, and strings
 * carry the minimal JSON escape set.
 *
 * DECISION: `undefined` throws rather than being dropped. Why: section 9.4
 * rule 2 requires absent members to be emitted as `null`, and silently
 * omitting one makes `{a: null}` and `{}` hash identically. Callers emit
 * known-absent members as `null`.
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

/** `toJSON` is honoured exactly as `JSON.stringify` does, so `Date` works. */
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

/**
 * Shortest round-trip ECMAScript form. `JSON.stringify` already produces it
 * (`1e+30`, `4.5`, `1e-27`, and `0` for `-0`); non-finite numbers are not JSON.
 */
function serializeNumber(value: number): string {
  if (!Number.isFinite(value)) {
    throw new RangeError(`Not a JSON number: ${String(value)}`);
  }
  return JSON.stringify(value);
}

function serializeComposite(value: object): string {
  return Array.isArray(value)
    ? serializeArray(value)
    : serializeObject(value as Record<string, unknown>);
}

function serializeArray(value: readonly unknown[]): string {
  return `[${value.map((element) => serialize(element)).join(",")}]`;
}

/**
 * `Array.prototype.sort` with no comparator orders by UTF-16 code unit, which
 * is exactly RFC 8785 §3.2.3's member ordering.
 */
function serializeObject(value: Record<string, unknown>): string {
  const members = Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${serialize(value[key])}`);
  return `{${members.join(",")}}`;
}
