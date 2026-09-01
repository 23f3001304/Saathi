/**
 * Where the window the user is watching actually is.
 *
 * The two surfaces differ in exactly one thing that policy cares about:
 * whether there is a real Chrome window on the user's own desktop. Everything
 * else in this package — the classifier, the redactor, the state machine — is
 * identical on both, which is why this is a two-value type and not a mode flag
 * threaded through every collaborator.
 */
export type SessionSurface = "native-window" | "container";

/**
 * What the relay is allowed to carry.
 *
 * DECISION: `native-window` keeps the original answer. There is a window the
 * user can already see, so a credential belongs in it — the relay refuses and
 * points there, and the keystrokes provably never traverse this process.
 *
 * A container has no such window. The relay is the only hand the user has, so
 * it carries the keystroke, and `FrameCapture` stops photographing the window
 * for as long as a protected field holds focus. That suppression is the
 * condition this is allowed on, not a nicety: the claim is not "we redact your
 * password", it is "we did not look".
 */
export interface RelayPolicy {
  readonly carriesSensitive: boolean;
}

export function relayPolicyFor(surface: SessionSurface): RelayPolicy {
  return { carriesSensitive: surface === "container" };
}

/**
 * Where control goes when the sandbox is the wrong place to be. On the native
 * surface that is the window on the desktop; in a container it is the user's
 * own browser, named by URL.
 */
export interface HandoffTarget {
  readonly surface: SessionSurface;
  readonly url: string;
  /** True only when a window on the user's own desktop was actually raised. */
  readonly fronted: boolean;
  readonly sentence: string;
}

/**
 * The sentence for the cases a container cannot do at all. A passkey or a
 * security key is bound to the user's own device by design — no relay can
 * carry one, and pretending otherwise would leave those sites as a dead end
 * with a confusing error instead of an answer.
 */
export const OWN_BROWSER_SENTENCE =
  "This sandbox cannot do that one. A passkey, a security key or anything else bound to your own device only works in the browser on your machine — no relay can carry it. Open the page there and finish it yourself; nothing here is holding your place.";

export function ownBrowserHandoff(url: string): HandoffTarget {
  return {
    surface: "container",
    url,
    fronted: false,
    sentence: OWN_BROWSER_SENTENCE,
  };
}

export class SurfaceMismatchError extends Error {
  constructor(
    readonly asked: SessionSurface,
    readonly launcher: SessionSurface,
  ) {
    super(
      `This session asked for a "${asked}" window and was handed a "${launcher}" launcher. The two must agree: the relay policy and the frame stream are chosen from the surface, and a session that is wrong about where its window is would be wrong about both.`,
    );
    this.name = "SurfaceMismatchError";
  }
}

export function assertSurface(
  asked: SessionSurface,
  launcher: SessionSurface,
): void {
  if (asked !== launcher) {
    throw new SurfaceMismatchError(asked, launcher);
  }
}
