import type { IsoTimestamp } from "./iso-timestamp.js";

/** Mental-accounting envelope (ARCHITECTURE §5.7, §3.8). */
export const ENVELOPE_PERIODS = ["day", "week", "month"] as const;

export type EnvelopePeriod = (typeof ENVELOPE_PERIODS)[number];

/** What the user signs into the Intent Mandate (§6.2 `envelopes[]`). */
export interface EnvelopeDeclaration {
  readonly category: string;
  readonly period: EnvelopePeriod;
  readonly cap_paise: number;
}

export const ENVELOPE_RESERVATION_STATES = [
  "open",
  "captured",
  "released",
] as const;

export type EnvelopeReservationState =
  (typeof ENVELOPE_RESERVATION_STATES)[number];

/**
 * Capacity is consumed at verify time, so open reservations are subtracted
 * alongside committed spend (§3.8, §5.2 c) — that is what stops a burst of
 * concurrent HNP verifications from overshooting a cap.
 */
export interface EnvelopeState {
  readonly category: string;
  readonly period: EnvelopePeriod;
  readonly capPaise: number;
  readonly committedPaise: number;
  readonly openReservedPaise: number;
  readonly resetsAt: IsoTimestamp;
  readonly oldestReservationExpiresAt: IsoTimestamp | null;
}

/** Reservations expire at cart-mandate `exp` + 10 minutes (decision 14). */
export const RESERVATION_GRACE_SECONDS = 600;

export function remainingPaise(envelope: EnvelopeState): number {
  return (
    envelope.capPaise - envelope.committedPaise - envelope.openReservedPaise
  );
}

export function drawFits(
  envelope: EnvelopeState,
  requestedPaise: number,
): boolean {
  return requestedPaise <= remainingPaise(envelope);
}
