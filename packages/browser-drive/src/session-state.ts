/** Who is holding the wheel. There is no fifth value and no implicit state. */
export type SessionState = "idle" | "agent-drive" | "user-drive" | "closed";

/**
 * Every context the agent is structurally forbidden from completing. The list
 * is closed on purpose: a reason nobody enumerated is a context nobody thought
 * about, and this package refuses rather than improvises.
 */
export type HandoffReason =
  "login" | "account-creation" | "otp" | "payment" | "captcha" | "final-review";

export const HANDOFF_REASONS: readonly HandoffReason[] = [
  "login",
  "account-creation",
  "otp",
  "payment",
  "captcha",
  "final-review",
];

export interface Handoff {
  readonly stage: SessionState;
  readonly reason: HandoffReason;
  readonly url: string;
  readonly at: string;
}

/** A transition the machine does not have an edge for. */
export class SessionStateError extends Error {
  constructor(
    readonly from: SessionState,
    readonly to: SessionState,
  ) {
    super(`Session cannot move from "${from}" to "${to}"`);
    this.name = "SessionStateError";
  }
}

/**
 * Thrown, not returned. A classifier block is an outcome the agent must read
 * and narrate; an action attempted while the *user* is driving is a wiring bug
 * in the host, and a bug that returns a value is a bug that gets ignored.
 */
export class UserDriveViolation extends Error {
  constructor(
    readonly action: string,
    readonly state: SessionState,
  ) {
    super(
      `The agent attempted "${action}" while the session was "${state}" — only the user acts here.`,
    );
    this.name = "UserDriveViolation";
  }
}

/**
 * The mirror of `UserDriveViolation`, and a bug of the same shape seen from
 * the other side: a keystroke relayed from the chat while the *agent* holds the
 * wheel means the host wired the two drivers together. Thrown, never returned,
 * for the same reason — a returned bug is a bug that gets logged and ignored.
 */
export class RelayViolation extends Error {
  constructor(
    readonly action: string,
    readonly state: SessionState,
  ) {
    super(
      `A relayed "${action}" arrived while the session was "${state}" — the user's input is only accepted while the user is driving.`,
    );
    this.name = "RelayViolation";
  }
}

const EDGES: Readonly<Record<SessionState, readonly SessionState[]>> = {
  idle: ["agent-drive", "closed"],
  "agent-drive": ["user-drive", "closed"],
  "user-drive": ["agent-drive", "closed"],
  closed: [],
};

export class SessionStateMachine {
  private state: SessionState = "idle";

  current(): SessionState {
    return this.state;
  }

  canTransition(to: SessionState): boolean {
    return EDGES[this.state].includes(to);
  }

  transition(to: SessionState): void {
    if (!this.canTransition(to)) {
      throw new SessionStateError(this.state, to);
    }
    this.state = to;
  }

  /**
   * The one gate every driver method passes through. `user-drive` is the
   * interesting case; `idle`/`closed` are refused for the same reason — a page
   * action outside a live agent turn has no journal context to belong to.
   */
  assertAgentMayAct(action: string): void {
    if (this.state !== "agent-drive") {
      throw new UserDriveViolation(action, this.state);
    }
  }

  /**
   * The gate on the relay. Symmetric to `assertAgentMayAct` and deliberately
   * as strict: `agent-drive` is refused because the agent is mid-action there,
   * `idle`/`closed` because there is no window to send the input to.
   */
  assertUserMayAct(action: string): void {
    if (this.state !== "user-drive") {
      throw new RelayViolation(action, this.state);
    }
  }
}
