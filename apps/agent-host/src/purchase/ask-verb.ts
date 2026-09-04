/** What the model asks, in its own words, with its own tappable answers. */
export interface AskRequest {
  readonly question: string;
  readonly replies: readonly string[];
  readonly groups: readonly {
    readonly label: string;
    readonly options: readonly string[];
  }[];
}

/**
 * Asking, as a move the model makes rather than a shape the shell reads out
 * of its prose.
 *
 * DECISION: this replaces sniffing a trailing "?" off a reply. A question
 * mark is a fact about punctuation, not about intent - it caught rhetorical
 * asides and missed questions that ended in a period - and every sentence
 * the shopper is asked to answer had to survive that guess. Now the model
 * says "I am asking", and the harness does the one thing only it can: park
 * the run and arm the composer.
 *
 * The chips are the model's too. `replies` for one axis, `groups` for a
 * compound question, both optional: a question with neither is a plain text
 * answer, which is also a fine question.
 */
export class AskVerb {
  private held: AskRequest | null = null;

  /** Records the ask. The BEAT is emitted once, by the step that closes the
   *  turn (`askTurn`), keeping this system's rule that every utterance has
   *  exactly one emitter: an errand that asks mid-run and then keeps working
   *  would otherwise arm the composer under a run still in flight. */
  ask(request: AskRequest): void {
    this.held = request;
  }

  /** What was asked this errand, or `null`. Cleared by `reset`. */
  get asked(): AskRequest | null {
    return this.held;
  }

  reset(): void {
    this.held = null;
  }
}
