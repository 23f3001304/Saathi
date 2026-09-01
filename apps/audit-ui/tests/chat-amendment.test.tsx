import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import { AmendmentProposals } from "../src/conversation/AmendmentProposals.tsx";
import { AmendmentProposal } from "../src/conversation/AmendmentProposal.tsx";
import { Covenant } from "../src/screens/Covenant.tsx";
import { applyAmendmentBeat } from "../src/covenant/amendmentBeat.ts";
import type { PendingAmendment } from "../src/covenant/amendmentModel.ts";
import { directionOf } from "../src/covenant/amendmentModel.ts";
import {
  clearAmendments,
  pendingAmendments,
  proposeAmendment,
} from "../src/covenant/pendingAmendments.ts";

/** The signed ceiling in the fixture covenant: ₹2,000 a purchase. */
const SIGNED_CAP_PAISE = 200_000;

function beat(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    kind: "amendment",
    amendmentId: "urn:covenant:amendment:1",
    summary: "Raise the ceiling to ₹9,000",
    changes: [
      {
        rule: "max_amount",
        scope: null,
        from: SIGNED_CAP_PAISE,
        to: 900_000,
        unit: "paise",
        currency: "INR",
        // What the host computed. The screen must not take its word for it.
        direction: "narrows",
      },
    ],
    ...over,
  };
}

function amendmentOf(over: Partial<PendingAmendment> = {}): PendingAmendment {
  return {
    id: "amd_1",
    summary: "Cap apparel at ₹3,000",
    proposedAt: "2026-08-31T10:00:00.000Z",
    changes: [
      {
        rule: "cap_paise",
        scope: "apparel",
        from: 500_000,
        to: 300_000,
        unit: "paise",
        currency: "INR",
      },
    ],
    ...over,
  };
}

// The Rules screen reads the fixture covenant here, not a gateway somebody
// happens to have running: the property under test is what the screen does
// with a proposal, and it must not depend on a port being up.
beforeEach(() => {
  vi.stubEnv("VITE_GATEWAY_URL", "");
});

afterEach(() => {
  clearAmendments();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("the proposal in the conversation", () => {
  it("shows what changes, from and to", () => {
    render(<AmendmentProposal amendment={amendmentOf()} />);
    expect(screen.getByText("Cap apparel at ₹3,000")).toBeInTheDocument();
    expect(screen.getByText("apparel budget")).toBeInTheDocument();
    expect(screen.getByText("₹5,000.00")).toBeInTheDocument();
    expect(screen.getByText("₹3,000.00")).toBeInTheDocument();
  });

  it("says a lowered cap narrows, and does not warn about it", () => {
    render(<AmendmentProposal amendment={amendmentOf()} />);
    expect(screen.getByText("narrows what I may do")).toBeInTheDocument();
    expect(screen.queryByText(/loosens a rule/)).toBeNull();
  });

  /**
   * The load-bearing UI property. The host said this change narrows; it
   * raises a ceiling from ₹2,000 to ₹9,000. The screen derives the direction
   * from the two numbers and contradicts the wire.
   */
  it("does not believe a wire that calls a raised ceiling a tightening", () => {
    expect(applyAmendmentBeat(beat())).toBe(true);
    const held = pendingAmendments()[0];
    expect(held).toBeDefined();
    expect(Object.keys(held!.changes[0]!)).not.toContain("direction");
    render(<AmendmentProposals />);
    expect(screen.getByText("widens what I may do")).toBeInTheDocument();
    expect(screen.getByText(/loosens a rule you signed/)).toBeInTheDocument();
  });

  it("computes direction the same way for every kind of rule", () => {
    const base = { scope: null, unit: null, currency: null };
    expect(
      directionOf({ ...base, rule: "hold_seconds", from: 86_400, to: 3_600 }),
    ).toBe("widens");
    expect(
      directionOf({
        ...base,
        rule: "merchant",
        scope: "kolam",
        from: true,
        to: false,
      }),
    ).toBe("narrows");
    expect(
      directionOf({
        ...base,
        rule: "requires_refundability",
        from: true,
        to: false,
      }),
    ).toBe("widens");
    expect(
      directionOf({ ...base, rule: "invented_rule", from: 1, to: 2 }),
    ).toBe("widens");
  });
});

describe("nothing takes effect without the pen", () => {
  it("offers a hold, not a button", () => {
    render(
      <AmendmentProposal amendment={amendmentOf()} onSeal={() => undefined} />,
    );
    const seal = screen.getByRole("button", { name: "Hold to sign" });
    expect(seal).toBeInTheDocument();
    expect(screen.getByLabelText("Hold progress")).toBeInTheDocument();
  });

  it("does not seal on a click", () => {
    const onSeal = vi.fn();
    render(<AmendmentProposal amendment={amendmentOf()} onSeal={onSeal} />);
    screen.getByRole("button", { name: "Hold to sign" }).click();
    expect(onSeal).not.toHaveBeenCalled();
  });

  it("keeps no pen on an amendment already sealed", () => {
    render(<AmendmentProposal amendment={amendmentOf()} sealed />);
    expect(screen.queryByRole("button", { name: "Hold to sign" })).toBeNull();
    expect(screen.getByText(/Signed ·/)).toBeInTheDocument();
  });
});

/**
 * The one that matters most: a rule instruction typed in chat does not, by
 * itself, move a ceiling. The assertion is against the covenant the Rules
 * screen is reading — the signed ₹2,000 is still on the page, unamended, and
 * the raise is sitting beside it as an unsigned amendment.
 */
describe("an unsigned instruction does not move a bound", () => {
  it("leaves the signed ceiling where it was and counts the change unsigned", async () => {
    applyAmendmentBeat(beat());
    render(<Covenant onRequestSign={() => undefined} />);

    const sentence = await screen.findByText(/Never spend above/);
    // The rule itself is untouched: it still reads the signed ₹2,000, and it
    // is not marked amended. The ₹9,000 exists only inside the proposal.
    expect(sentence.textContent).toContain("₹2,000.00");
    expect(sentence.textContent).not.toContain("₹9,000.00");
    expect(screen.getAllByText("Amend").length).toBeGreaterThan(0);
    expect(screen.queryByText("Amended, unsigned")).toBeNull();
    expect(screen.getByText(/1 change, unsigned./)).toBeInTheDocument();
  });

  it("never asks the gateway to sign anything on its own", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    applyAmendmentBeat(beat());
    render(<Covenant onRequestSign={() => undefined} />);
    await waitFor(() =>
      expect(screen.getByText(/1 change, unsigned./)).toBeInTheDocument(),
    );
    const urls = fetchSpy.mock.calls.map(([url]) => String(url));
    expect(urls.some((url) => url.includes("/sign"))).toBe(false);
  });
});

describe("one pending set, two screens", () => {
  it("shows the same amendment on the Rules screen it showed in chat", async () => {
    act(() => proposeAmendment(amendmentOf()));
    render(<Covenant onRequestSign={() => undefined} />);
    await waitFor(() =>
      expect(screen.getByText("Asked for in conversation")).toBeInTheDocument(),
    );
    expect(screen.getByText("Cap apparel at ₹3,000")).toBeInTheDocument();
  });

  it("stops being pending on the Rules screen once it is sealed in chat", async () => {
    act(() => proposeAmendment(amendmentOf()));
    render(<Covenant onRequestSign={() => undefined} />);
    await waitFor(() =>
      expect(screen.getByText(/1 change, unsigned./)).toBeInTheDocument(),
    );
    act(() => clearAmendments());
    await waitFor(() =>
      expect(screen.getByText(/0 changes, unsigned./)).toBeInTheDocument(),
    );
    expect(screen.queryByText("Asked for in conversation")).toBeNull();
  });
});
