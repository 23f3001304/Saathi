/**
 * The two ways this host says "not you, not now" about the sandbox window.
 * Kept beside the service rather than inside it because the routes import them
 * to choose a status code, and a file of refusals is easier to read whole than
 * scattered through the class that throws them.
 */
export class NotYourTurnError extends Error {
  constructor(readonly state: string) {
    super(
      `The window is in "${state}". Relayed input is only accepted while you are driving.`,
    );
    this.name = "NotYourTurnError";
  }
}

/**
 * A caller naming a window that is no longer the open one. Distinct from
 * `NotYourTurnError`, which is about the wheel: this is about *which* browser,
 * and it is what stops a stale tab holding a still-valid session key from
 * relaying its keystrokes into somebody else’s errand.
 */
export class NotYourWindowError extends Error {
  constructor(
    readonly asked: string,
    readonly open: string | null,
  ) {
    super(
      `This host has no open sandbox called "${asked}". That window is gone and its container with it; nothing was relayed. Reload the Bench to attach to the current one.`,
    );
    this.name = "NotYourWindowError";
  }
}
