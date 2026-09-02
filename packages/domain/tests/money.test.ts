import { describe, expect, it } from "vitest";
import { Money } from "../src/money.js";

const INR = "INR";

const additionTable: readonly (readonly [number, number, number])[] = [
  [10, 20, 30],
  [1, 2, 3],
  [199999, 1, 200000],
  [-500, 500, 0],
  [250000, 249999, 499999],
];

const comparisonTable: readonly (readonly [number, number, -1 | 0 | 1])[] = [
  [100, 200, -1],
  [200, 100, 1],
  [200, 200, 0],
  [-1, 0, -1],
];

const formatTable: readonly (readonly [number, string])[] = [
  [0, "INR 0.00"],
  [5, "INR 0.05"],
  [199900, "INR 1999.00"],
  [-2550, "-INR 25.50"],
];

// W3C PaymentCurrencyAmount strings (§6.3) — the only text→money path.
const majorUnitsTable: readonly (readonly [string, number])[] = [
  ["1899.00", 189900],
  ["0.05", 5],
  ["0", 0],
  ["2000", 200000],
  ["249.5", 24950],
  ["-25.50", -2550],
];

const invalidMajorUnits: readonly string[] = [
  "1899.000",
  "1,899.00",
  "₹1899.00",
  "1899.",
  "",
  "1e5",
];

const invalidPaise: readonly number[] = [
  10.5,
  0.1 + 0.2,
  Number.NaN,
  Number.POSITIVE_INFINITY,
  Number.MAX_SAFE_INTEGER + 1,
];

describe("Money.fromPaise", () => {
  it.each(invalidPaise)("rejects non-integer paise: %s", (paise) => {
    expect(() => Money.fromPaise(paise, INR)).toThrow(RangeError);
  });

  it.each(["inr", "RUPEE", "IN", ""])(
    'rejects non ISO-4217 currency: "%s"',
    (currency) => {
      expect(() => Money.fromPaise(100, currency)).toThrow(RangeError);
    },
  );
});

describe("Money.fromMajorUnits", () => {
  it.each(majorUnitsTable)('reads "%s" as %d paise', (value, expected) => {
    expect(Money.fromMajorUnits(value, INR).paise).toBe(expected);
  });

  it.each(invalidMajorUnits)('rejects "%s"', (value) => {
    expect(() => Money.fromMajorUnits(value, INR)).toThrow(RangeError);
  });

  it("never routes a decimal string through a float", () => {
    expect(
      Money.fromMajorUnits("0.10", INR).add(Money.fromMajorUnits("0.20", INR))
        .paise,
    ).toBe(30);
  });
});

describe("Money arithmetic", () => {
  it.each(additionTable)("adds %d + %d paise = %d", (left, right, expected) => {
    expect(
      Money.fromPaise(left, INR).add(Money.fromPaise(right, INR)).paise,
    ).toBe(expected);
  });

  it("stays exact where float rupees would drift", () => {
    expect(0.1 + 0.2).not.toBe(0.3);
    expect(Money.fromPaise(10, INR).add(Money.fromPaise(20, INR)).paise).toBe(
      30,
    );
  });

  it("accumulates without drift", () => {
    let total = Money.zero(INR);
    for (let index = 0; index < 1000; index += 1) {
      total = total.add(Money.fromPaise(1, INR));
    }
    expect(total.equals(Money.fromPaise(1000, INR))).toBe(true);
  });

  it("refuses cross-currency arithmetic", () => {
    expect(() =>
      Money.fromPaise(1, INR).add(Money.fromPaise(1, "USD")),
    ).toThrow(TypeError);
  });
});

describe("Money comparison", () => {
  it.each(comparisonTable)(
    "compares %d against %d as %d",
    (left, right, expected) => {
      expect(
        Money.fromPaise(left, INR).compare(Money.fromPaise(right, INR)),
      ).toBe(expected);
    },
  );

  it.each(comparisonTable)("isAtMost %d vs %d", (left, right, expected) => {
    expect(
      Money.fromPaise(left, INR).isAtMost(Money.fromPaise(right, INR)),
    ).toBe(expected <= 0);
  });

  it("treats different currencies as unequal without throwing", () => {
    expect(Money.fromPaise(1, INR).equals(Money.fromPaise(1, "USD"))).toBe(
      false,
    );
  });
});

describe("Money formatting", () => {
  it.each(formatTable)('renders %d paise as "%s"', (paise, expected) => {
    expect(Money.fromPaise(paise, INR).toString()).toBe(expected);
  });
});
