import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { SealRow } from "../src/instrument/SealRow.tsx";
import type { VerdictCheckResult } from "../src/ledger/types.ts";

const PASSING: VerdictCheckResult[] = [
  { check: "intent_bounds", passed: true },
  { check: "nonce", passed: true },
  { check: "uri_pin", passed: true },
  { check: "risk_data", passed: true },
  { check: "memory_digest", passed: true },
  { check: "quote_match", passed: true },
  { check: "envelope", passed: true },
  { check: "cooloff", passed: true },
];

describe("SealRow", () => {
  it("switches from a settled row to a stage-0 rejection on the same instance without crashing", () => {
    // Regression: `useEffect` was declared textually after the stage0
    // early return, so the same long-lived SealRow instance (Instrument
    // never remounts it between txns) called a different number of hooks
    // depending on which branch it took — React's "rendered fewer hooks
    // than expected" error, reproduced only by re-rendering, not by a
    // single render.
    const { rerender } = render(<SealRow checks={PASSING} latencyMs={64} />);

    expect(() =>
      rerender(<SealRow checks={[]} stage0Rejection={{ reason_code: "URI_DOWNGRADE" }} />),
    ).not.toThrow();

    expect(() => rerender(<SealRow checks={PASSING} latencyMs={64} />)).not.toThrow();
  });

  it("renders all eight checks pending under a stage-0 rejection, with the reason surfaced", () => {
    const { getByText, getAllByRole } = render(
      <SealRow checks={[]} stage0Rejection={{ reason_code: "URI_DOWNGRADE", human_sentence: "refused" }} />,
    );
    expect(getByText("URI_DOWNGRADE")).toBeDefined();
    expect(getAllByRole("img")).toHaveLength(8);
  });
});
