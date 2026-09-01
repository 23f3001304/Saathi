// Razorpay caps `reference_id` and `receipt` at 40 characters. The fake rail
// accepted anything, so this only showed up the first time real test keys were
// used: `POST /payment_links/` answered 400 "reference_id: the length must be
// no more than 40" on a perfectly ordinary mandate id.
import { describe, expect, it } from "vitest";

import { railReference } from "../src/razorpay-payment-rail.js";

const JTI = "urn:uuid:5cc5c2d8-2785-4fd9-afa8-1860c2f100d9";

describe("fitting a covenant id into Razorpay's 40-character field", () => {
  it("trims the URN scheme, leaving the UUID that made it unique", () => {
    expect(railReference(JTI)).toBe("5cc5c2d8-2785-4fd9-afa8-1860c2f100d9");
    expect(railReference(JTI).length).toBeLessThanOrEqual(40);
  });

  it("trims any covenant URN, not just uuid ones", () => {
    expect(railReference("urn:covenant:run:abc123")).toBe("run:abc123");
  });

  it("leaves a value that already fits exactly as it was", () => {
    expect(railReference("TS1989")).toBe("TS1989");
  });

  it("keeps the end when even the bare id is too long, where ids differ", () => {
    const long = `urn:uuid:${"a".repeat(30)}-tail-0123456789`;
    const short = railReference(long);
    expect(short).toHaveLength(40);
    expect(short.endsWith("tail-0123456789")).toBe(true);
  });

  it("is stable, so a retry reuses the same reference", () => {
    expect(railReference(JTI)).toBe(railReference(JTI));
  });
});
