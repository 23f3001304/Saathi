import { describe, expect, it } from "vitest";

import { strictSchema } from "../src/providers/strict-schema.js";

/**
 * The three things OpenAI's strict subset actually refuses, probed against the
 * live API rather than assumed: a property missing from `required`, a missing
 * `additionalProperties: false`, and a `format` outside its short list.
 * Everything else zod emits - minLength, pattern, minItems, minimum, default,
 * and anyOf, which the old comment here wrongly blamed - it accepts.
 */
describe("the strict-mode schema transform", () => {
  it("requires every property, so nothing may be quietly omitted", () => {
    const out = strictSchema({
      type: "object",
      properties: { a: { type: "string" }, b: { type: "number" } },
      required: ["a"],
    }) as Record<string, unknown>;
    expect(out["required"]).toEqual(["a", "b"]);
  });

  it("closes every object to properties it did not declare", () => {
    const out = strictSchema({
      type: "object",
      properties: { a: { type: "string" } },
      required: ["a"],
    }) as Record<string, unknown>;
    expect(out["additionalProperties"]).toBe(false);
  });

});

describe("formats and constraints under strict mode", () => {
  it("drops a format the subset does not know, and keeps one it does", () => {
    const out = strictSchema({
      type: "object",
      properties: {
        link: { type: "string", format: "uri" },
        when: { type: "string", format: "date-time" },
      },
      required: ["link", "when"],
    }) as { properties: Record<string, Record<string, unknown>> };
    expect(out.properties["link"]?.["format"]).toBeUndefined();
    expect(out.properties["when"]?.["format"]).toBe("date-time");
  });

  it("keeps the constraints the subset does accept", () => {
    const out = strictSchema({
      type: "object",
      properties: {
        a: { type: "string", minLength: 1, maxLength: 300, pattern: "^c[0-9]$" },
        b: { type: "array", items: { type: "string" }, minItems: 2 },
        c: { type: "integer", minimum: 0, maximum: 10 },
      },
      required: ["a", "b", "c"],
    }) as { properties: Record<string, Record<string, unknown>> };
    expect(out.properties["a"]?.["maxLength"]).toBe(300);
    expect(out.properties["a"]?.["pattern"]).toBe("^c[0-9]$");
    expect(out.properties["b"]?.["minItems"]).toBe(2);
    expect(out.properties["c"]?.["maximum"]).toBe(10);
  });
});

describe("the transform reaching every level", () => {
  it("closes objects nested inside arrays", () => {
    const out = strictSchema({
      type: "object",
      properties: {
        rows: {
          type: "array",
          items: {
            type: "object",
            properties: { url: { type: "string", format: "uri" } },
            required: [],
          },
        },
      },
      required: ["rows"],
    }) as { properties: { rows: { items: Record<string, unknown> } } };
    const item = out.properties.rows.items as {
      additionalProperties: unknown;
      required: unknown;
      properties: Record<string, Record<string, unknown>>;
    };
    expect(item.additionalProperties).toBe(false);
    expect(item.required).toEqual(["url"]);
    expect(item.properties["url"]?.["format"]).toBeUndefined();
  });

});

describe("anyOf and free-form objects", () => {
  it("is reached inside, and the subset does accept it", () => {
    const out = strictSchema({
      type: "object",
      properties: {
        held: {
          anyOf: [
            { type: "object", properties: { a: { type: "string" } }, required: [] },
            { type: "null" },
          ],
        },
      },
      required: ["held"],
    }) as { properties: { held: { anyOf: Record<string, unknown>[] } } };
    expect(out.properties.held.anyOf[0]?.["additionalProperties"]).toBe(false);
    expect(out.properties.held.anyOf[0]?.["required"]).toEqual(["a"]);
  });

  /** An object with no declared properties is a free-form record, and closing
   *  it to nothing would make it unusable rather than strict. */
  it("leaves an object with no declared properties alone", () => {
    const out = strictSchema({ type: "object" }) as Record<string, unknown>;
    expect(out["additionalProperties"]).toBeUndefined();
  });

  it("does not mutate what it was given", () => {
    const source = {
      type: "object",
      properties: { a: { type: "string" } },
      required: [],
    };
    strictSchema(source);
    expect(source.required).toEqual([]);
  });
});
