import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { PriceSparkline } from "../src/flywheel/PriceSparkline.tsx";

describe("PriceSparkline", () => {
  it("renders a placeholder for an empty history instead of NaN SVG attributes", () => {
    // Regression: with no points, min/max collapse to ±Infinity and every
    // coordinate becomes NaN (browser smoke test caught the console errors
    // this produced on /ledger before its price-history fetch resolves).
    const { container } = render(<PriceSparkline points={[]} />);
    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
    const numericAttrs = ["x", "y", "cx", "cy", "width", "height"];
    for (const el of Array.from(container.querySelectorAll("*"))) {
      for (const attr of numericAttrs) {
        const value = el.getAttribute(attr);
        if (value !== null) expect(Number.isNaN(Number(value))).toBe(false);
      }
    }
  });

  it("renders finite coordinates for a normal history", () => {
    const points = [
      { ts: "2026-08-01T00:00:00.000Z", pricePaise: 129_900 },
      { ts: "2026-08-02T00:00:00.000Z", pricePaise: 129_900, listedMrpPaise: 299_900 },
    ];
    const { container } = render(<PriceSparkline points={points} />);
    expect(container.querySelector("path")?.getAttribute("d")).not.toContain("NaN");
  });
});
