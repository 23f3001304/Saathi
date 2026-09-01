import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { enterDesk } from "./enterDesk.tsx";
import { fetchOrders } from "../src/api/ordersApi.ts";
import {
  capturedPaise,
  committedPaise,
  cooloffOrders,
  minutesUntil,
  stateLabel,
} from "../src/orders/orderState.ts";
import type { OrderView } from "../src/api/merchantTypes.ts";

function order(
  state: string,
  amountPaise: number,
  cooloffUntil: string | null,
): OrderView {
  return {
    txnId: `txn_${state}_${amountPaise.toString()}`,
    state,
    amountPaise,
    currency: "INR",
    merchantIssuer: "urn:covenant:merchant:kolam-run",
    cartMandateId: "urn:uuid:x",
    createdAt: "2026-08-31T10:00:00.000Z",
    cooloffUntil,
  };
}

const ROWS = [
  order("captured", 129900, null),
  order("pending_cooloff", 189900, "2026-08-31T13:40:00.000Z"),
  order("link_issued", 44900, null),
];

describe("orders are money, not shipments", () => {
  it("counts only captured payments as money that arrived", () => {
    expect(capturedPaise(ROWS)).toBe(129900);
  });

  it("keeps cool-off money separate from captured money", () => {
    expect(committedPaise(ROWS)).toBe(189900);
    expect(cooloffOrders(ROWS)).toHaveLength(1);
  });

  it("names every state from the covenant, and none from a warehouse", () => {
    expect(stateLabel("pending_cooloff")).toBe("In cool-off");
    expect(stateLabel("link_issued")).toBe("Awaiting payment");
    expect(stateLabel("parked")).toBe("Parked");
  });

  it("reads a release time as minutes remaining, never as a negative", () => {
    const now = new Date("2026-08-31T13:20:00.000Z");

    expect(minutesUntil("2026-08-31T13:40:00.000Z", now)).toBe(20);
    expect(minutesUntil("2026-08-31T13:00:00.000Z", now)).toBe(0);
    expect(minutesUntil(null, now)).toBeNull();
  });

  it("shows only this shop's records, because the route serves the tenant", async () => {
    const mine = await fetchOrders("urn:covenant:merchant:kolam-run");

    expect(mine.orders).toHaveLength(2);
    expect(
      mine.orders.every(
        (row) => row.merchantIssuer === "urn:covenant:merchant:kolam-run",
      ),
    ).toBe(true);
  });
});

describe("the orders page", () => {
  it("has a cool-off board and says the merchant cannot act on one", async () => {
    await enterDesk("Orders");

    expect(
      await screen.findByRole("heading", { name: /Waiting out a cool-off/i }),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(
        screen.getByText(/Only the buyer can cancel/i),
      ).toBeInTheDocument();
    });
  });

  it("offers no control over a buyer's cool-off", async () => {
    await enterDesk("Orders");
    await screen.findByRole("heading", { name: /Waiting out a cool-off/i });

    expect(
      screen.queryByRole("button", { name: /cancel|release/i }),
    ).toBeNull();
  });

  it("carries no fulfilment column", async () => {
    await enterDesk("Orders");
    await screen.findByRole("heading", { name: /Every record/i });
    const html = document.body.innerHTML.toLowerCase();

    expect(html).not.toContain("shipped");
    expect(html).not.toContain("tracking");
    expect(html).not.toContain("delivery");
  });
});
