import { describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

import type { PaymentState } from "../src/api/paymentState.ts";
import { PayPanel } from "../src/conversation/PayPanel.tsx";

function state(over: Partial<PaymentState> = {}): PaymentState {
  return {
    txnId: "txn_1",
    txnState: "link_issued",
    settled: "waiting",
    orderId: "order_1",
    paymentId: null,
    linkUrl: "https://rzp.io/i/abc123",
    amountPaise: 189_900,
    currency: "INR",
    keyId: "rzp_test_public",
    ...over,
  };
}

describe("PayPanel while the money has not arrived", () => {
  it("offers checkout on the order and the link for a phone", () => {
    render(<PayPanel payment={state()} onNudge={() => undefined} />);
    expect(screen.getByRole("button", { name: "Pay now" })).toBeTruthy();
    expect(screen.getByText("rzp.io/i/abc123")).toBeTruthy();
    expect(screen.getByText(/Waiting for payment/)).toBeTruthy();
  });

  it("prints the URL beside the code rather than the code alone", async () => {
    render(<PayPanel payment={state()} onNudge={() => undefined} />);
    const link = screen.getByRole("link", { name: "rzp.io/i/abc123" });
    expect(link.getAttribute("href")).toBe("https://rzp.io/i/abc123");
    // Generated locally: the src is the QR itself, not a request to anyone.
    await waitFor(() => {
      const qr = screen.getByRole("img", { name: /Scan to open/ });
      expect(qr.getAttribute("src")).toMatch(/^data:image\/svg\+xml/);
    });
  });

  it("still offers a way to pay when no link could be minted", () => {
    render(
      <PayPanel payment={state({ linkUrl: null })} onNudge={() => undefined} />,
    );
    expect(screen.getByRole("button", { name: "Pay now" })).toBeTruthy();
    expect(screen.getByText(/No payment link was issued/)).toBeTruthy();
    expect(screen.queryByRole("img", { name: /Scan to open/ })).toBeNull();
  });

  it("says so plainly when there is no route at all", () => {
    render(
      <PayPanel
        payment={state({ linkUrl: null, orderId: null, keyId: null })}
        onNudge={() => undefined}
      />,
    );
    expect(screen.getByText(/no payment route yet/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Pay now" })).toBeNull();
  });
});

describe("PayPanel once the ledger has answered", () => {
  it("shows paid with the payment id and stops offering to pay", () => {
    render(
      <PayPanel
        payment={state({ settled: "paid", paymentId: "pay_live_1" })}
        onNudge={() => undefined}
      />,
    );
    expect(screen.getByText("Paid")).toBeTruthy();
    expect(screen.getByText("pay_live_1")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Pay now" })).toBeNull();
    expect(screen.queryByText(/Waiting for payment/)).toBeNull();
  });

  it("reports a failure without claiming anything was charged", () => {
    render(
      <PayPanel
        payment={state({ settled: "failed" })}
        onNudge={() => undefined}
      />,
    );
    expect(screen.getByText(/did not go through/)).toBeTruthy();
    // A failed attempt is retryable: the pay route stays on screen.
    expect(screen.getByRole("button", { name: "Pay now" })).toBeTruthy();
  });
});
