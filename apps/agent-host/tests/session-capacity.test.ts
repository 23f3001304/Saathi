// How many sandboxes this machine can hold, and how deep the line behind them
// goes. Pure arithmetic over measured inputs, so it needs no Docker and no
// Chrome — which is the point of deriving the cap rather than picking one.
import { describe, expect, it } from "vitest";

import {
  capFor,
  capFrom,
  MAX_SESSIONS,
  queueLimitFor,
} from "../src/browser/session-capacity.js";

/**
 * The cap is derived from what the machine has, not chosen. A number someone
 * picked would drift from the hardware the moment either changed.
 */
describe("how many windows this machine holds", () => {
  it("takes the smaller of what memory and CPU allow", () => {
    // 24 cores against --cpus 2 is 12; memory would have allowed 27.
    expect(capFor({ dockerMemMb: 31786, cpus: 24 })).toBe(MAX_SESSIONS);
    // A memory-poor VM is the more common shape and must win.
    expect(capFor({ dockerMemMb: 4096, cpus: 24 })).toBe(1);
    expect(capFor({ dockerMemMb: 8192, cpus: 8 })).toBe(4);
  });

  it("never returns zero, however small the machine", () => {
    expect(capFor({ dockerMemMb: 512, cpus: 1 })).toBe(1);
  });

  it("sizes the queue between 1.5x and 2x the cap", () => {
    for (const cap of [1, 3, 8, 12]) {
      const queue = queueLimitFor(cap);
      expect(queue).toBeGreaterThanOrEqual(Math.ceil(cap * 1.5));
      expect(queue).toBeLessThanOrEqual(cap * 2);
    }
  });
});

describe("an operator who knows their own machine", () => {
  it("keeps the derived number when nobody has said otherwise", () => {
    expect(capFrom({}, 4)).toBe(4);
    expect(capFrom({ COVENANT_SANDBOX_CAP: "" }, 4)).toBe(4);
  });

  it("takes the number it is given, up to the ceiling", () => {
    expect(capFrom({ COVENANT_SANDBOX_CAP: "3" }, 2)).toBe(3);
    expect(capFrom({ COVENANT_SANDBOX_CAP: "99" }, 2)).toBe(MAX_SESSIONS);
  });

  /** Nonsense is not an instruction. A cap of zero would be a host that can
   *  open no window at all, which nobody means to ask for. */
  it("ignores nonsense rather than acting on it", () => {
    expect(capFrom({ COVENANT_SANDBOX_CAP: "0" }, 2)).toBe(2);
    expect(capFrom({ COVENANT_SANDBOX_CAP: "-1" }, 2)).toBe(2);
    expect(capFrom({ COVENANT_SANDBOX_CAP: "two" }, 2)).toBe(2);
    expect(capFrom({ COVENANT_SANDBOX_CAP: "2.5" }, 2)).toBe(2);
  });
});
