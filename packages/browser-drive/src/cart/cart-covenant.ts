import type { CartConfidence, CartReading } from "./cart-dom.js";
import { toRupees } from "./price.js";

export interface CovenantBounds {
  /** Integer minor units, matching `IntentBounds.allowance.max_amount`. */
  readonly capPaise: number;
  readonly currency: string;
}

export type CovenantOutcome = "within_cap" | "over_cap" | "unreadable";

export interface CovenantVerdict {
  readonly outcome: CovenantOutcome;
  readonly assists: boolean;
  readonly capPaise: number;
  readonly observedPaise: number | null;
  readonly confidence: CartConfidence;
  readonly basis: string;
  readonly human: string;
}

const TRUSTWORTHY: readonly CartConfidence[] = ["medium", "high"];

/**
 * Advisory, and the wording is the point. On a merchant that speaks ACP/AP2 the
 * cap is enforced at the rail; on a foreign page scraped through Chrome there is
 * no rail to hold, and claiming otherwise would be the exact unaccountable
 * behaviour §5.9 argues against. So the covenant here is scoped honestly: the
 * agent withdraws its assistance and says why. The window stays open and the
 * user can still act — we refuse to *help*, we do not pretend to have control.
 */
export class CartCovenant {
  constructor(private readonly bounds: CovenantBounds) {}

  check(reading: CartReading): CovenantVerdict {
    if (reading.currency !== this.bounds.currency) {
      return this.unreadable(
        reading,
        currencyMismatch(reading.currency, this.bounds.currency),
      );
    }
    if (
      reading.totalPaise === null ||
      !TRUSTWORTHY.includes(reading.confidence)
    ) {
      return this.unreadable(reading, UNREADABLE_HUMAN);
    }
    return reading.totalPaise > this.bounds.capPaise
      ? this.over(reading, reading.totalPaise)
      : this.within(reading, reading.totalPaise);
  }

  private within(reading: CartReading, observed: number): CovenantVerdict {
    return {
      ...this.base(reading, observed),
      outcome: "within_cap",
      assists: true,
      human: `The cart reads ${toRupees(observed)}, inside your ${toRupees(this.bounds.capPaise)} cap. Handing you the final review.`,
    };
  }

  private over(reading: CartReading, observed: number): CovenantVerdict {
    return {
      ...this.base(reading, observed),
      outcome: "over_cap",
      assists: false,
      human: `The cart reads ${toRupees(observed)} against a ${toRupees(this.bounds.capPaise)} cap. On a page like this the agent cannot hold a limit — so it stops assisting here and does not open the payment step. The window is yours; nothing has been paid.`,
    };
  }

  private unreadable(reading: CartReading, human: string): CovenantVerdict {
    return {
      ...this.base(reading, reading.totalPaise),
      outcome: "unreadable",
      assists: false,
      human,
    };
  }

  private base(
    reading: CartReading,
    observed: number | null,
  ): Omit<CovenantVerdict, "outcome" | "assists" | "human"> {
    return {
      capPaise: this.bounds.capPaise,
      observedPaise: observed,
      confidence: reading.confidence,
      basis: reading.basis,
    };
  }
}

const UNREADABLE_HUMAN =
  "The total on this page could not be read with enough confidence to check it against your cap, so the agent stops rather than guess. Read it yourself in the window before going further.";

function currencyMismatch(read: string, expected: string): string {
  return `This cart appears to be priced in ${read}, but your covenant is set in ${expected}. The agent will not convert a cap it was not given.`;
}
