import { describe, expect, it } from "vitest";
import {
  CANCEL_RESTORE_SECONDS,
  TRANSACTION_STATES,
  canTransition,
  isFinal,
  type TransactionState,
} from "../src/index.js";

// §3.7's state machine, one row per legal move.
const legal: readonly (readonly [TransactionState, TransactionState])[] = [
  ["approved", "link_issued"],
  ["approved", "pending_cooloff"],
  ["pending_cooloff", "approved"],
  ["pending_cooloff", "cancelled"],
  ["link_issued", "captured"],
  ["link_issued", "failed"],
  ["failed", "parked"],
  ["cancelled", "pending_cooloff"],
];

const illegal: readonly (readonly [TransactionState, TransactionState])[] = [
  ["captured", "cancelled"],
  ["captured", "failed"],
  ["cancelled", "approved"],
  ["parked", "captured"],
  ["approved", "captured"],
  ["pending_cooloff", "link_issued"],
];

describe("transaction state machine", () => {
  it("declares the seven states the DDL checks", () => {
    expect(TRANSACTION_STATES).toEqual([
      "pending_cooloff",
      "approved",
      "link_issued",
      "captured",
      "failed",
      "cancelled",
      "parked",
    ]);
  });

  it.each(legal)("allows %s -> %s", (from, to) => {
    expect(canTransition(from, to)).toBe(true);
  });

  it.each(illegal)("refuses %s -> %s", (from, to) => {
    expect(canTransition(from, to)).toBe(false);
  });

  it("keeps the 5 s undo as the only backwards edge", () => {
    expect(CANCEL_RESTORE_SECONDS).toBe(5);
    expect(canTransition("cancelled", "pending_cooloff")).toBe(true);
  });

  it("closes the cancel window at maturity, not at capture", () => {
    expect(isFinal("captured")).toBe(true);
    expect(isFinal("parked")).toBe(true);
    expect(isFinal("cancelled")).toBe(false);
    expect(isFinal("pending_cooloff")).toBe(false);
  });
});
