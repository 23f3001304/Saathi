/**
 * The hold-to-sign seam. §6.2's authority is the *user's* signature, so the run
 * stops here and waits for a human, and the CLI and the e2e — which have no
 * browser to hold a button down — set `auto`.
 *
 * DECISION: `auto` is a boot-time configuration flag, never a per-request one.
 * Why: an HTTP body that could switch a confirmation gate off is a confirmation
 * gate the caller controls, and the caller is exactly who it exists to stop.
 */
export class GateRefused extends Error {
  constructor() {
    super("the shopper closed this conversation before signing");
    this.name = "GateRefused";
  }
}

export class ConfirmationGate {
  private release: (() => void) | null = null;
  private refuse_: ((cause: GateRefused) => void) | null = null;
  private released = false;

  constructor(private readonly auto: boolean) {}

  get pending(): boolean {
    return this.release !== null;
  }

  reset(): void {
    this.release = null;
    this.refuse_ = null;
    this.released = false;
  }

  wait(): Promise<void> {
    if (this.auto || this.released) {
      return Promise.resolve();
    }
    return new Promise<void>((resolve, reject) => {
      this.release = resolve;
      this.refuse_ = reject;
    });
  }

  /** A refusal is the counter-signature: the run waiting on this gate
   *  aborts rather than standing forever for a chat that was deleted. */
  refuse(): boolean {
    const waiting = this.refuse_;
    this.release = null;
    this.refuse_ = null;
    if (waiting === null) return false;
    waiting(new GateRefused());
    return true;
  }

  /** `false` when nothing was waiting — a signature nobody asked for. */
  sign(): boolean {
    this.released = true;
    const waiting = this.release;
    this.release = null;
    if (waiting === null) {
      return false;
    }
    waiting();
    return true;
  }
}
