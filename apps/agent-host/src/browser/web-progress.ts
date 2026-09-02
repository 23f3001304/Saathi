import type { HandoffReason } from "@covenant/browser-drive";

/**
 * What the *harness* watched an errand do at the window, as opposed to what the
 * errand says it did.
 *
 * Only two facts, and both are things this process performed itself: it filled
 * a delivery form from trait memory, and it handed the window over. Everything
 * the checkout flow decides afterwards — whether to ask about the address,
 * whether to park — is decided from these rather than from a sentence, for the
 * same reason `WebTrail` exists: a report written from the model's account of
 * its own errand is a report that can be wrong in the one direction that
 * matters.
 */
export class WebProgress {
  private filledSlots: readonly string[] = [];
  private handed: HandoffReason | null = null;
  private cartClicked = false;
  private signedInFromVault = false;
  private challenged: "code" | "password" | null = null;

  /** Slots this host actually typed into, this errand. */
  get filled(): readonly string[] {
    return this.filledSlots;
  }

  /** This host clicked an add-to-basket control and the page settled. The
   *  third observed fact, same provenance as the other two: the click is the
   *  host's own act, whatever the errand later says about a basket. */
  get carted(): boolean {
    return this.cartClicked;
  }

  /** Why the window stopped being the agent's this errand, or `null`. */
  get handedOver(): HandoffReason | null {
    return this.handed;
  }

  /**
   * True where the errand was interrupted by something the shopper can clear —
   * a sign-in, a bot check. Not the payment step: that is the end of the road,
   * not a pause, and there is nothing to come back for.
   */
  get resumable(): boolean {
    return this.handed !== null && this.handed !== "payment";
  }

  /** True when a form was filled and the window is still the agent's — the
   *  shape that owes the shopper a question. */
  get awaitsAddress(): boolean {
    return this.filledSlots.length > 0 && this.handed === null;
  }

  recordFilled(slots: readonly string[]): void {
    this.filledSlots = [...this.filledSlots, ...slots];
  }

  recordHandover(reason: HandoffReason): void {
    this.handed ??= reason;
  }

  recordCarted(): void {
    this.cartClicked = true;
  }

  /** The host signed in from the vault, and what still challenged after. */
  recordSignedIn(challenge: "code" | "password" | null): void {
    this.signedInFromVault = true;
    this.challenged = challenge;
  }

  /** This host typed the stored sign-in, whatever the shop said next. */
  get signedIn(): boolean {
    return this.signedInFromVault;
  }

  /** A code page stands and the window is still the agent's: the shape that
   *  owes the shopper the code question. */
  get awaitsCode(): boolean {
    return this.challenged === "code" && this.handed === null;
  }

  reset(): void {
    this.filledSlots = [];
    this.handed = null;
    this.cartClicked = false;
    this.signedInFromVault = false;
    this.challenged = null;
  }

  /** A resumed checkout keeps the basket it parked with. The click that
   *  carted was this host's own act in the earlier leg; wiping it made the
   *  closing line deny a basket this host itself had filled. */
  resumeReset(): void {
    this.filledSlots = [];
    this.handed = null;
    this.challenged = null;
  }
}
