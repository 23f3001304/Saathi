// How many sandboxes this machine can hold, and how deep the line behind them
// goes. Pure arithmetic over measured inputs, so it needs no Docker and no
// Chrome — which is the point of deriving the cap rather than picking one.
import { describe, expect, it } from "vitest";

import {
  capFor,
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
