/**
 * Where a provider adapter puts prose while the model is still producing it.
 *
 * DECISION: this seam carries display, never decisions. Everything that
 * reaches it is a fragment of an answer nobody has judged yet, so it goes to a
 * screen and never back into the run. Confidence scoring, schema validation
 * and the admissibility check still read the complete answer, exactly as they
 * did before any of this streamed — what changed is when the shopper sees
 * words, not when the harness decides anything.
 */
export interface TurnStream {
  delta(text: string): void;
}

/**
 * One model round trip's worth of stream, and what became of it.
 *
 * `settle` says the round trip finished and its prose stands until the harness
 * speaks for itself. `withdraw` takes it back: with a reason, the shopper is
 * told why the words they had started reading went; with an empty one it was
 * merely superseded by the model's own continuation and goes without comment.
 */
export interface Draft extends TurnStream {
  readonly id: string;
  settle(): void;
  withdraw(reason: string): void;
}

/** The model's continuation replaces its own preamble, and says nothing. */
export const SUPERSEDED = "";

/**
 * Where an adapter gets a draft. A session is built once and answers many
 * turns, each of which may take several round trips, so the scope is what the
 * session holds and a draft is what one round trip writes into.
 */
export interface DraftScope {
  open(): Draft;
}

/** Where drafts are actually published — the same shape, named for the end it
 *  sits at: one process-wide sink, one scope per model attempt. */
export type DraftSink = DraftScope;

export const SILENT_DRAFT: Draft = {
  id: "",
  delta: () => {},
  settle: () => {},
  withdraw: () => {},
};

/** What a session gets when nobody is watching: every call is a no-op, so the
 *  adapter needs no branch of its own for the blocking case. */
export const SILENT_SCOPE: DraftScope = { open: () => SILENT_DRAFT };

/**
 * Fragments arrive one token at a time; a bubble does not need one beat per
 * token. Text is held until it reaches `MIN_FLUSH_CHARS` and stands at a word
 * boundary, which keeps the beat log an order of magnitude shorter without
 * ever splitting a word across two frames on screen.
 */
export const MIN_FLUSH_CHARS = 12;

export class CoalescingStream implements TurnStream {
  private held = "";

  constructor(private readonly sink: (text: string) => void) {}

  delta(text: string): void {
    this.held += text;
    if (this.held.length < MIN_FLUSH_CHARS) {
      return;
    }
    const cut = this.held.lastIndexOf(" ");
    if (cut <= 0) {
      return;
    }
    this.flushTo(cut + 1);
  }

  /** Everything still held, whether or not it ended on a word. */
  close(): void {
    this.flushTo(this.held.length);
  }

  private flushTo(cut: number): void {
    const ready = this.held.slice(0, cut);
    this.held = this.held.slice(cut);
    if (ready.length > 0) {
      this.sink(ready);
    }
  }
}
