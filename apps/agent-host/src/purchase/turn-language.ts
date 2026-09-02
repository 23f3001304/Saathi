/**
 * The reply language the app sent with this turn, held where a read can find
 * it.
 *
 * DECISION: a holder rather than a parameter. The planner's tools are built
 * once per lane and the setting arrives once per sentence; threading it
 * through the collector would make a tool's shape depend on the turn it
 * happens to run in. The runner sets it first thing, before anything reads.
 */
export class TurnLanguage {
  private held: string | null = null;

  set(language: string | null): void {
    this.held = language;
  }

  current(): string | null {
    return this.held;
  }
}
