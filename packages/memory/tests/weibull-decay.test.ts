import { expect, it } from "vitest";

import {
  DECAY_PARAMS,
  decayWeight,
  halfLifeSeconds,
  paramsFor,
  weightFor,
} from "../src/index.js";

const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** The stated half-life column of §9.3, in seconds. */
const STATED = [
  { type: "fact", predicate: "price", seconds: 4.8 * HOUR },
  { type: "fact", predicate: "stock", seconds: 37 * MINUTE },
  { type: "fact", predicate: "terms", seconds: 21.5 * DAY },
  { type: "preference", predicate: null, seconds: 120 * DAY },
  { type: "procedure", predicate: null, seconds: 231 * DAY },
  { type: "episode", predicate: null, seconds: 62.4 * DAY },
] as const;

const CREATED = "2026-08-31T12:00:00.000Z";

const at = (elapsedSeconds: number): Date =>
  new Date(Date.parse(CREATED) + elapsedSeconds * 1000);

const entry = (type: "fact" | "episode", predicate: string | null) => ({
  type,
  predicate,
  tCreated: CREATED,
});

it.each(DECAY_PARAMS)(
  "$type/$predicate halves at its own half-life and is exp(-1) at eta",
  (row) => {
    expect(Math.abs(decayWeight(row, halfLifeSeconds(row)) - 0.5)).toBeLessThan(
      0.01,
    );
    expect(decayWeight(row, row.etaSeconds)).toBeCloseTo(Math.exp(-1), 10);
  },
);

it.each(STATED)("$type/$predicate matches its stated half-life", (stated) => {
  const params = paramsFor(stated.type, stated.predicate);
  const computed = halfLifeSeconds(params ?? { etaSeconds: 1, kappa: 1 });
  // §9.3 states the column rounded ("≈ 37 min"), so 2% is the honest band.
  expect(Math.abs(computed / stated.seconds - 1)).toBeLessThan(0.02);
});

it("is 1 at the instant of creation", () => {
  expect(weightFor(entry("fact", "price"), at(0))).toBe(1);
});

it("hand-computed: a price quote after 3 hours weighs exp(-0.5^1.6)", () => {
  const expected = Math.exp(-Math.pow(0.5, 1.6));
  expect(weightFor(entry("fact", "price"), at(3 * HOUR))).toBeCloseTo(
    expected,
    10,
  );
  expect(expected).toBeCloseTo(0.719, 3);
});

it("hand-computed: a stock claim after 90 minutes weighs exp(-4)", () => {
  expect(weightFor(entry("fact", "stock"), at(90 * MINUTE))).toBeCloseTo(
    Math.exp(-4),
    10,
  );
});

it("hand-computed: an episode after 180 days weighs exp(-2)", () => {
  expect(weightFor(entry("episode", null), at(180 * DAY))).toBeCloseTo(
    Math.exp(-2),
    10,
  );
});

it("falls an unlisted fact predicate back to the merchant-policy row", () => {
  expect(paramsFor("fact", "warranty")).toMatchObject({
    etaSeconds: 30 * DAY,
    kappa: 1.1,
  });
});

it("gives a constraint no decay row at all (decision 40)", () => {
  expect(paramsFor("constraint", "max_amount")).toBeNull();
  expect(DECAY_PARAMS.some((row) => row.type === "constraint")).toBe(false);
});

it("weighs a constraint 1.0 after ten years", () => {
  const constraint = {
    type: "constraint" as const,
    predicate: "max_amount",
    tCreated: CREATED,
  };
  expect(weightFor(constraint, at(3650 * DAY))).toBe(1);
});
