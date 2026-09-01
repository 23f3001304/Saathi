import { describe, expect, it } from "vitest";

import { negotiationStep } from "../src/buyer/negotiation-machine.js";
import {
  NegotiationSession,
  parseMove,
} from "../src/buyer/negotiation-session.js";
import { say, ScriptedQuotes, ScriptedSession } from "./doubles.js";
import {
  OFFER,
  OVER_CAP,
  POLICY,
  QUOTED,
  ROWS,
  START,
} from "./negotiation-rows.js";

describe("negotiation state machine", () => {
  it.each(ROWS)("$name", (row) => {
    const next = negotiationStep(row.from, row.event, POLICY);

    expect(next.phase).toBe(row.phase);
    expect(next.reason).toBe(row.reason);
  });
});

describe("negotiation machine holds the cap the user signed", () => {
  it("clamps a counter to the signed intent cap", () => {
    const next = negotiationStep(
      QUOTED,
      { kind: "counter", targetPaise: 999999 },
      POLICY,
    );

    expect(next.targetPaise).toBe(POLICY.capPaise);
  });

  it("never accepts an offer above the cap, whatever the model says", () => {
    const overCap = negotiationStep(
      START,
      { kind: "quote", offer: OVER_CAP },
      POLICY,
    );

    const next = negotiationStep(overCap, { kind: "accept" }, POLICY);

    expect(next.phase).toBe("abandoned");
    expect(next.reason).toBe("exceeds_intent_cap");
  });
});

describe("negotiation machine ends rather than drifts", () => {
  it("abandons once the rounds are spent", () => {
    let state = QUOTED;
    for (let round = 0; round < POLICY.maxRounds + 1; round += 1) {
      state = negotiationStep(
        state,
        { kind: "counter", targetPaise: 170000 },
        POLICY,
      );
    }

    expect(state.phase).toBe("abandoned");
    expect(state.reason).toBe("rounds_exhausted");
  });

  it("absorbs every event once terminal", () => {
    const agreed = negotiationStep(QUOTED, { kind: "accept" }, POLICY);

    expect(
      negotiationStep(agreed, { kind: "counter", targetPaise: 1 }, POLICY),
    ).toBe(agreed);
  });
});

describe("parseMove", () => {
  it.each([
    ['{"move":"accept"}', "accept"],
    ['sure — {"move":"counter","target_paise":170000}', "counter"],
    ['{"move":"walk_away","reason":"too_dear"}', "walk_away"],
    ["I think we should just buy it", "walk_away"],
    ["{not json", "walk_away"],
  ])("reads %s as %s", (text, kind) => {
    expect(parseMove(text).kind).toBe(kind);
  });
});

describe("NegotiationSession over a scripted LLM", () => {
  it("accepts the first affordable quote when the model says so", async () => {
    const quotes = new ScriptedQuotes([OFFER]);
    const session = new NegotiationSession(
      new ScriptedSession([say('{"move":"accept"}')]),
      quotes,
      POLICY,
    );

    const state = await session.run({
      sku: OFFER.sku,
      openingTargetPaise: 180000,
    });

    expect(state.phase).toBe("agreed");
    expect(state.best?.totalPaise).toBe(189900);
    expect(quotes.targets).toEqual([180000]);
  });
});

describe("NegotiationSession counters before it closes", () => {
  it("asks the merchant again at the countered price", async () => {
    const quotes = new ScriptedQuotes([
      OFFER,
      { ...OFFER, totalPaise: 175000 },
    ]);
    const session = new NegotiationSession(
      new ScriptedSession([
        say('{"move":"counter","target_paise":175000}'),
        say('{"move":"accept"}'),
      ]),
      quotes,
      POLICY,
    );

    const state = await session.run({
      sku: OFFER.sku,
      openingTargetPaise: 180000,
    });

    expect(state.phase).toBe("agreed");
    expect(state.round).toBe(1);
    expect(quotes.targets).toEqual([180000, 175000]);
    expect(state.best?.totalPaise).toBe(175000);
  });
});

describe("NegotiationSession bounds a model that oversteps", () => {
  it("clamps a model that counters above the cap", async () => {
    const quotes = new ScriptedQuotes([OFFER]);
    const session = new NegotiationSession(
      new ScriptedSession([
        say('{"move":"counter","target_paise":900000}'),
        say('{"move":"accept"}'),
      ]),
      quotes,
      POLICY,
    );

    await session.run({ sku: OFFER.sku, openingTargetPaise: 180000 });

    expect(quotes.targets[1]).toBe(POLICY.capPaise);
  });
});

describe("NegotiationSession walks away rather than guessing", () => {
  it("stops when the merchant will not quote", async () => {
    const session = new NegotiationSession(
      new ScriptedSession([say('{"move":"accept"}')]),
      new ScriptedQuotes([null]),
      POLICY,
    );

    const state = await session.run({
      sku: OFFER.sku,
      openingTargetPaise: 180000,
    });

    expect(state.phase).toBe("abandoned");
    expect(state.reason).toBe("no_quote");
  });

  it("walks away rather than guessing when the move is unreadable", async () => {
    const session = new NegotiationSession(
      new ScriptedSession([say("buy it, obviously")]),
      new ScriptedQuotes([OFFER]),
      POLICY,
    );

    const state = await session.run({
      sku: OFFER.sku,
      openingTargetPaise: 180000,
    });

    expect(state.phase).toBe("abandoned");
    expect(state.reason).toBe("unreadable_move");
  });
});
