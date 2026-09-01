// The orders floor, for a build with no gateway. Labelled as fixtures on the
// screen that shows them: an unconfigured console must look calm and honest,
// never like a live shop that happens to have sold nothing.
import type { OrderView } from "./merchantTypes.ts";

const ISSUER = "urn:covenant:merchant:kolam-run";

/**
 * One row per state a merchant can actually be shown, including the two that
 * matter most and that no other seller console has: a purchase still inside
 * its cool-off with a release time, and one that parked after a failure
 * instead of quietly disappearing.
 */
export function fixtureOrders(issuer: string | null): OrderView[] {
  const owner = issuer ?? ISSUER;
  return [
    row(
      owner,
      "pending_cooloff",
      189900,
      "2026-08-31T13:10:00.000Z",
      "2026-08-31T13:40:00.000Z",
    ),
    row(
      owner,
      "pending_cooloff",
      44900,
      "2026-08-31T12:58:00.000Z",
      "2026-08-31T13:28:00.000Z",
    ),
    row(owner, "captured", 129900, "2026-08-31T11:04:00.000Z", null),
    row(owner, "link_issued", 179900, "2026-08-31T10:41:00.000Z", null),
    row(owner, "failed", 49900, "2026-08-30T19:22:00.000Z", null),
    row(owner, "parked", 249900, "2026-08-30T18:02:00.000Z", null),
    row(owner, "cancelled", 99900, "2026-08-30T16:31:00.000Z", null),
  ];
}

function row(
  issuer: string,
  state: string,
  amountPaise: number,
  createdAt: string,
  cooloffUntil: string | null,
): OrderView {
  const suffix = `${state}-${amountPaise.toString()}`;
  return {
    txnId: `txn_fixture_${suffix}`,
    state,
    amountPaise,
    currency: "INR",
    merchantIssuer: issuer,
    cartMandateId: `urn:uuid:fixture-${suffix}`,
    createdAt,
    cooloffUntil,
  };
}
