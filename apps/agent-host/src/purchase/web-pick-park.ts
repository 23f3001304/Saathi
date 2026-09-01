/**
 * A pick that stopped to ask one question, and the fact that it did.
 *
 * DECISION: the harness parks on what it *observed*, never on what the model
 * said. The errand filled a delivery form (the fill tool reports that, and only
 * the host can call it) and the window was not handed over — so the checkout is
 * standing at an address the shopper has not yet agreed to. That pair of facts
 * is the park; a model claiming to have asked cannot create one, and a model
 * forgetting to ask cannot avoid one.
 *
 * DECISION: parking, rather than a gate the run blocks on. `ConfirmationGate`
 * is the other shape and it is right for a signature — the run waits, a route
 * releases it. It is wrong here: the release is a sentence the shopper types,
 * a second sentence queues behind the run in flight (`ChatService.start`), and
 * a run waiting for a message that is waiting for the run is a deadlock. So the
 * turn ends, the window stays exactly where it is, and the next turn resumes.
 */
/** Why a checkout is standing still: a question this host asked, or a door
 *  only the shopper can open. Both resume; they resume differently. */
export type ParkReason = "address" | "handback";

export class WebPickPark {
  private ref: string | null = null;
  private why: ParkReason = "address";

  /** Which listing is parked mid-checkout, or `null` when none is. */
  get held(): string | null {
    return this.ref;
  }

  get parked(): boolean {
    return this.ref !== null;
  }

  get reason(): ParkReason {
    return this.why;
  }

  hold(ref: string, why: ParkReason): void {
    this.ref = ref;
    this.why = why;
  }

  release(): void {
    this.ref = null;
  }
}
