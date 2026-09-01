// What the card renders, as data. Kept apart from the component so the
// transport, the wire parser and the viewport can all name the same shape
// without importing the thing that draws it.

export type BrowserAction = {
  readonly id: string;
  readonly label: string;
  /** `refused` carries the harness's own sentence, verbatim. */
  readonly outcome: "ok" | "refused";
  /** Who did it. The ledger distinguishes the two; so does this row. */
  readonly actor?: "agent" | "user";
  readonly reason?: string;
};

export type BrowserSandbox = {
  /** `container` is a Docker container; `native-window` is this machine. */
  readonly surface: "native-window" | "container";
  readonly id: string;
};

/** A tick where the host took no picture at all, and why. */
export type BrowserBlackout = {
  readonly category: string;
  readonly human: string;
};

/**
 * Set on a card whose contents are canned, and absent on every card a live
 * host filled in. It is not decoration: the reel wears the same shape as a
 * real session, so without this the panel cannot tell the difference and
 * neither can the person reading it.
 */
export type BrowserSample = {
  /** The one-word chip, as TransportNotice spells it: `demo` or `offline`. */
  readonly label: string;
  readonly human: string;
};

export type BrowserSessionView = {
  /** Which window this is. Sent back on every call that reaches it. */
  readonly id?: string;
  readonly sandbox?: BrowserSandbox;
  /** Set while the host is not capturing, because a protected field has focus. */
  readonly blackout?: BrowserBlackout;
  /** Set when nothing is behind this card. Absent means a host answered. */
  readonly sample?: BrowserSample;
  readonly merchant: string;
  readonly url: string;
  readonly title: string;
  /** Live frame from the sandbox, when the host is streaming one. */
  readonly frame?: string;
  /** The frame's own pixel size, so a click can be mapped back to the page. */
  readonly frameWidth?: number;
  readonly frameHeight?: number;
  readonly redacted?: number;
  /**
   * `unreachable` is the card's own, never the wire's: the log says the run
   * left this window open and this page cannot see it. It is not `closed`,
   * which is a claim about the window rather than about the connection.
   */
  /** The conversation whose run claimed this window, when the host says. */
  readonly conversation?: string | null;
  readonly state:
    "idle" | "agent-drive" | "user-drive" | "closed" | "unreachable";
  readonly handoff?: {
    readonly reason: string;
    readonly ask: string;
    readonly readiness?: string;
  };
  readonly actions: readonly BrowserAction[];
  /** Why this card is showing nothing, when it is showing nothing. */
  readonly notice?: string;
};
