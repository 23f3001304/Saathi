/**
 * The JSON Schema a provider's strict mode will actually accept.
 *
 * DECISION: strict is on, and this is what makes it possible. The old comment
 * here said strict was impossible because "zod's nullable ints become anyOf,
 * which the strict subset rejects". That was simply wrong, and the cost of
 * believing it was the whole enforcement layer: with `strict: false` a tool
 * schema is advice, so a model could answer a required field with nothing, add
 * fields nobody declared, and never be told. Probed against the live API, the
 * subset accepts anyOf, minLength, maxLength, pattern, minItems, maxItems,
 * minimum, maximum and default. It refuses exactly three things, and each of
 * them is a mechanical fix rather than a redesign of every declaration:
 *
 *   1. a property that is not in `required`
 *   2. an object without `additionalProperties: false`
 *   3. a `format` outside its own short list - `uri`, which every `z.url()`
 *      emits, is not on it
 *
 * So the declarations keep their zod shapes and their host-side parsing, and
 * this walks what zod produced on the way out. Nothing here loosens a check:
 * the host still validates every value it is handed, exactly as before.
 */

/** The formats the strict subset knows. Anything else fails the whole tool. */
const KNOWN_FORMATS = new Set([
  "date-time",
  "time",
  "date",
  "duration",
  "email",
  "hostname",
  "ipv4",
  "ipv6",
  "uuid",
]);

/** Where a schema may hold another one. Walked so a nested object is closed
 *  too: strict is checked at every level, not only the top. */
const BRANCHES = ["anyOf", "allOf", "oneOf"] as const;

type Node = Record<string, unknown>;

function isNode(value: unknown): value is Node {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function branchesOf(node: Node): Node {
  const out: Node = {};
  for (const key of BRANCHES) {
    const held = node[key];
    if (Array.isArray(held)) out[key] = held.map((entry) => strictSchema(entry));
  }
  return out;
}

/**
 * Every declared property becomes required.
 *
 * A field the model may leave out is a field the model will leave out, and the
 * host then reads a default it never chose. Optionality that is real belongs in
 * the type - a nullable field the model must send as `null` - which says "I
 * considered this and there is none" rather than saying nothing at all.
 */
function objectOf(node: Node, properties: Node): Node {
  const walked: Node = {};
  for (const [name, child] of Object.entries(properties)) {
    walked[name] = strictSchema(child);
  }
  return {
    properties: walked,
    required: Object.keys(properties),
    additionalProperties: false,
  };
}

export function strictSchema(schema: unknown): unknown {
  if (!isNode(schema)) return schema;
  const node: Node = { ...schema };
  const format = node["format"];
  if (typeof format === "string" && !KNOWN_FORMATS.has(format)) {
    delete node["format"];
  }
  if (node["items"] !== undefined) {
    node["items"] = strictSchema(node["items"]);
  }
  const defs = node["$defs"];
  if (isNode(defs)) {
    node["$defs"] = objectDefs(defs);
  }
  const properties = node["properties"];
  return {
    ...node,
    ...branchesOf(node),
    // Only where properties were declared: an object with none is a free-form
    // record, and closing it to nothing would make it unusable, not strict.
    ...(isNode(properties) ? objectOf(node, properties) : {}),
  };
}

function objectDefs(defs: Node): Node {
  const out: Node = {};
  for (const [name, held] of Object.entries(defs)) {
    out[name] = strictSchema(held);
  }
  return out;
}
