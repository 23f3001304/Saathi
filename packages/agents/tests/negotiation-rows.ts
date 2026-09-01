import type {
  NegotiationEvent,
  NegotiationPolicy,
  NegotiationState,
  QuoteOffer,
} from "../src/buyer/negotiation-machine.js";
import {
  initialNegotiation,
  negotiationStep,
} from "../src/buyer/negotiation-machine.js";

export const POLICY: NegotiationPolicy = { capPaise: 200000, maxRounds: 2 };

export const OFFER: QuoteOffer = {
  sku: "ASC-GC9-UK8",
  totalPaise: 189900,
  quoteJti: "urn:uuid:q1",
};

export const OVER_CAP: QuoteOffer = { ...OFFER, totalPaise: 249900 };

interface Row {
  readonly name: string;
  readonly from: NegotiationState;
  readonly event: NegotiationEvent;
  readonly phase: string;
  readonly reason: string | null;
}

export const START = initialNegotiation(POLICY, 180000);
export const QUOTED = negotiationStep(
  START,
  { kind: "quote", offer: OFFER },
  POLICY,
);

export const ROWS: readonly Row[] = [
  {
    name: "a quote moves browsing to quoting",
    from: START,
    event: { kind: "quote", offer: OFFER },
    phase: "quoting",
    reason: null,
  },
  {
    name: "a counter opens a round",
    from: QUOTED,
    event: { kind: "counter", targetPaise: 175000 },
    phase: "countering",
    reason: null,
  },
  {
    name: "accepting an affordable quote agrees",
    from: QUOTED,
    event: { kind: "accept" },
    phase: "agreed",
    reason: null,
  },
  {
    name: "walking away abandons",
    from: QUOTED,
    event: { kind: "walk_away", reason: "no_stock" },
    phase: "abandoned",
    reason: "no_stock",
  },
  {
    name: "accepting with nothing quoted abandons",
    from: START,
    event: { kind: "accept" },
    phase: "abandoned",
    reason: "nothing_to_accept",
  },
];
