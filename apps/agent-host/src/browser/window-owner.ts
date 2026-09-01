/**
 * Which conversation a sandbox window belongs to.
 *
 * Ownership stamps at window BIRTH, from the claim of the run in flight. A
 * window that outlives its run — user-drive blocks retirement — keeps its
 * original owner rather than adopting the next run's chat: stamping at run
 * start instead handed a surviving Snapdeal window to a fresh kurta chat,
 * which then rendered someone else's errand as its own.
 */
export class WindowOwner {
  claimedBy: string | null = null;
  pendingClaim: string | null = null;

  stampAtBirth(): void {
    this.claimedBy = this.pendingClaim;
  }

  release(): void {
    this.claimedBy = null;
  }
}
