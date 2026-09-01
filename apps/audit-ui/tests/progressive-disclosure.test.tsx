// The density pass turned the Bench into two states: a calm buyer view with
// the audit instrument folded behind a one-line trust summary, and the full
// instrument one click away. These cover the fold itself — that the
// collapsed state states the verdict, that the expanded state is reachable,
// and that nothing is deleted on the way down.
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { TrustSummary } from "../src/instrument/TrustSummary.tsx";
import { MemoryRail } from "../src/instrument/MemoryRail.tsx";
import { deriveSealStates } from "../src/ledger/selectors.ts";
import type { VerdictCheckResult } from "../src/ledger/types.ts";
import type { MemoryEntryView } from "../src/ledger/reducer.ts";

const ALL_PASSING: VerdictCheckResult[] = [
  { check: "intent_bounds", passed: true },
  { check: "nonce", passed: true },
  { check: "uri_pin", passed: true },
  { check: "risk_data", passed: true },
  { check: "memory_digest", passed: true },
  { check: "quote_match", passed: true },
  { check: "envelope", passed: true },
  { check: "cooloff", passed: true },
];

function memory(id: string, tier: MemoryEntryView["tier"], content: string): MemoryEntryView {
  return {
    id,
    type: "constraint",
    tier,
    content,
    hash: `${id}aaaabbbbcccc`,
    source_channel: "chat",
    t_valid: "2026-08-01T00:00:00.000Z",
    t_invalid: null,
    t_created: "2026-08-01T00:00:00.000Z",
    t_expired: null,
    outcome: "retrieved",
  };
}

const MEMORIES = [memory("m1", "P3", "Never above ₹2,000"), memory("m2", "P2", "Prefers navy"), memory("m3", "P0", "Browsed kurtas")];

describe("TrustSummary — the collapsed instrument", () => {
  it("states the whole verdict in one line: checks, latency, digest", () => {
    render(
      <TrustSummary seals={deriveSealStates(ALL_PASSING)} latencyMs={64} digestVerified expanded={false} onToggle={() => undefined} />,
    );
    expect(screen.getByText("8 checks passed · 64 ms · memories match")).toBeDefined();
  });

  it("reports its collapsed/expanded state to assistive tech and flips the affordance", () => {
    const { rerender } = render(
      <TrustSummary seals={deriveSealStates(ALL_PASSING)} latencyMs={64} digestVerified expanded={false} onToggle={() => undefined} />,
    );
    const collapsed = screen.getByRole("button");
    expect(collapsed.getAttribute("aria-expanded")).toBe("false");
    expect(collapsed.textContent).toContain("Inspect");

    rerender(
      <TrustSummary seals={deriveSealStates(ALL_PASSING)} latencyMs={64} digestVerified expanded onToggle={() => undefined} />,
    );
    const expanded = screen.getByRole("button");
    expect(expanded.getAttribute("aria-expanded")).toBe("true");
    expect(expanded.textContent).toContain("Hide");
  });

  it("unfolds the instrument when clicked", () => {
    const onToggle = vi.fn();
    render(<TrustSummary seals={deriveSealStates(ALL_PASSING)} latencyMs={64} digestVerified expanded={false} onToggle={onToggle} />);
    fireEvent.click(screen.getByRole("button"));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("keeps all eight checks legible while collapsed — the strip folds, it does not drop marks", () => {
    render(
      <TrustSummary seals={deriveSealStates(ALL_PASSING)} latencyMs={64} digestVerified expanded={false} onToggle={() => undefined} />,
    );
    expect(screen.getAllByRole("img")).toHaveLength(8);
  });

  it("leads with the failure, not the pass count, when a check failed", () => {
    const failed: VerdictCheckResult[] = [
      { check: "intent_bounds", passed: true },
      { check: "envelope", passed: false, reason_code: "ENVELOPE_EXHAUSTED", human_sentence: "That would break your monthly cap." },
    ];
    render(<TrustSummary seals={deriveSealStates(failed)} digestVerified={false} expanded={false} onToggle={() => undefined} />);
    expect(screen.getByText("That would break your monthly cap.")).toBeDefined();
    expect(screen.getByRole("button").getAttribute("data-trust-summary")).toBe("blocked");
  });
});

describe("MemoryRail — the folded table", () => {
  it("rests as a count and a tier list rather than a five-column table", () => {
    render(<MemoryRail memories={MEMORIES} />);
    expect(screen.getByText("3 memories")).toBeDefined();
    expect(screen.getByText("P3 P2 P0")).toBeDefined();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("unfolds to the full table, with every row's content intact", () => {
    render(<MemoryRail memories={MEMORIES} />);
    fireEvent.click(screen.getByText("Show"));
    expect(screen.getByRole("table")).toBeDefined();
    expect(screen.getByText("Never above ₹2,000")).toBeDefined();
    expect(screen.getByText("Browsed kurtas")).toBeDefined();
  });

  it("can be handed to callers already open, for print and for tests", () => {
    render(<MemoryRail memories={MEMORIES} defaultOpen />);
    expect(screen.getByRole("table")).toBeDefined();
  });
});
