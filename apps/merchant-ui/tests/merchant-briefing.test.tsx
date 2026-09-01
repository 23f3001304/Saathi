import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { briefingFor } from "../src/advisor/briefing.ts";
import { ListingAudit } from "../src/panels/ListingAudit.tsx";
import { Briefing } from "../src/panels/Briefing.tsx";
import {
  fixtureAudit,
  fixtureDemand,
  fixtureDesk,
  fixtureLeakage,
} from "../src/api/merchantFixtures.ts";

const INPUT = {
  standing: fixtureDesk().merchants[0] ?? null,
  audit: fixtureAudit(),
  demand: fixtureDemand(),
  leakage: fixtureLeakage(),
};

describe("the merchant advisor's ranking", () => {
  it("puts the quote mismatches first, because they cost the most", () => {
    const items = briefingFor(INPUT);

    expect(items[0]?.key).toBe("mismatch");
  });

  it("ranks everything the fold charges for above everything it does not", () => {
    const scored = briefingFor(INPUT).map((item) => item.scored);

    expect(scored.lastIndexOf(true)).toBeLessThan(scored.indexOf(false));
  });

  it("orders within a band by weight, highest first", () => {
    const unscored = briefingFor(INPUT)
      .filter((item) => !item.scored)
      .map((item) => item.weight);

    expect(unscored).toEqual([...unscored].sort((a, b) => b - a));
  });

  it("says so plainly when nothing is costing a sale", () => {
    render(
      <Briefing standing={null} audit={null} demand={null} leakage={null} />,
    );

    expect(
      screen.getByText(/Nothing is costing you a sale right now/i),
    ).toBeInTheDocument();
  });
});

describe("the listing audit", () => {
  it("names the pattern, quotes the merchant's own words, and gives the counter", () => {
    render(<ListingAudit audit={fixtureAudit()} />);

    expect(screen.getByText("Scarcity")).toBeInTheDocument();
    expect(screen.getByText(/“Only 2 left”/)).toBeInTheDocument();
    expect(screen.getByText(/untrusted text/i)).toBeInTheDocument();
  });

  it("says how many listings are clean", () => {
    render(<ListingAudit audit={fixtureAudit()} />);

    expect(screen.getByText(/1 of 3 listings are clean/)).toBeInTheDocument();
  });
});
