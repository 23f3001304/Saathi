/**
 * Where the sandbox window actually went, in order.
 *
 * DECISION: the closing sentence of an open-web look is written from this and
 * not from the model's own account of its errand. The failure this whole path
 * exists to kill is an agent saying "I looked on Amazon" when it looked at a
 * local fixture catalog, and the only cure for that is to report the act from
 * the record of the act. A page is on this list because a navigation was
 * allowed and landed; nothing the model says can add one.
 */
export class WebTrail {
  private readonly landed: string[] = [];

  record(url: string): void {
    this.landed.push(url);
  }

  /** How many pages had been reached before an errand began. */
  get length(): number {
    return this.landed.length;
  }

  /** The distinct pages reached since `from`, oldest first. */
  since(from: number): readonly string[] {
    return [...new Set(this.landed.slice(Math.max(from, 0)))];
  }
}
