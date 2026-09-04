import type { JSX } from "react";
import { LiveViewport } from "./LiveViewport.tsx";
import type { BrowserSample, BrowserSessionView } from "./browserSession.ts";
import type { RelayInput, RelayRefusal } from "./browserTransport.ts";
import styles from "./BrowserSessionCard.module.css";

export type { BrowserAction, BrowserSessionView } from "./browserSession.ts";

type BrowserSessionCardProps = {
  session: BrowserSessionView;
  /** The whole screen, for as long as the human drives. */
  fullscreen?: boolean;
  /** The window is still the agent's and the run has finished. The state
   *  machine has no `agent-drive` → `idle` edge (see `session-state.ts`), so
   *  the window really is still held; what is wrong is only the card claiming
   *  somebody is at it. It says the truth instead, and the wheel is offered. */
  idleAgent?: boolean;
  onResume: () => void;
  /** Absent on a card with no window behind it, which is what withholds the
   *  wheel from a restored, canned or unreachable one. */
  onTakeover?: () => void;
  onRelay?: (input: RelayInput) => void;
  refusal?: RelayRefusal | null;
  onFront?: () => void;
  /** Tears the view's stream down and reattaches; the shopper's own way
   *  out of a frozen picture. */
  onReconnect?: () => void;
  /** Opens the window again where it left off, after the idle watch has
   *  closed it. Absent where there is nothing to reopen. */
  onRestart?: () => void;
};

const HANDOFF_TITLE: Record<string, string> = {
  login: "Sign in yourself",
  "account-creation": "Create the account yourself",
  otp: "Enter the code yourself",
  payment: "Pay yourself",
  captcha: "Prove you are human",
  "final-review": "The window is yours",
};

/**
 * The provenance line, in the shape TransportNotice already uses. It sits
 * above the chrome rather than below the picture because it governs
 * everything under it — the URL, the driver chip and the action list are all
 * canned when this is showing.
 */
function Sample({ sample }: { sample: BrowserSample }): JSX.Element {
  return (
    <p className={styles.sample} role="status">
      <span className={styles.sampleLabel}>{sample.label}</span>
      <span>{sample.human}</span>
    </p>
  );
}

/** A window nobody is at: canned, closed, or one this page cannot reach. A
 *  card claiming a driver over any of the three is claiming a live window. */
function undriven(session: BrowserSessionView): boolean {
  return (
    session.sample !== undefined ||
    session.state === "closed" ||
    session.state === "unreachable"
  );
}

function Chrome({
  session,
  idleAgent = false,
}: {
  session: BrowserSessionView;
  idleAgent?: boolean;
}): JSX.Element {
  const nobody = undriven(session) || idleAgent;
  const yours = !undriven(session) && session.state === "user-drive";
  return (
    <div className={styles.chrome}>
      <span className={styles.dots} aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
      <span className={styles.url} title={session.url}>
        {session.url}
      </span>
      {session.sandbox !== undefined && (
        <span className={styles.sandboxNote} title={session.sandbox.id}>
          {session.sandbox.surface === "container"
            ? "in a container"
            : "on this machine"}
        </span>
      )}
      <span
        className={
          nobody
            ? `${styles.driver} ${styles.nobody}`
            : yours
              ? `${styles.driver} ${styles.yours}`
              : styles.driver
        }
      >
        {idleAgent
          ? "Done looking: take the wheel or ask me something"
          : nobody
            ? "nobody is driving"
            : yours
              ? "You are driving"
              : "Saathi is driving"}
      </span>
    </div>
  );
}

/**
 * The refusal, said in the harness's words and answered with the only thing
 * that can answer it. The button does not retry: it raises the real window,
 * because the whole reason this failed is that the keys must not come through
 * this page.
 */
function Refused({
  refusal,
  onFront,
}: {
  refusal: RelayRefusal;
  onFront?: () => void;
}): JSX.Element {
  return (
    <div className={styles.refusal} role="alert">
      <p className={styles.refusalLine}>{refusal.human}</p>
      {refusal.nativeEntry !== null && (
        <p className={styles.nativeEntry}>{refusal.nativeEntry}</p>
      )}
      {refusal.handOffNatively && onFront !== undefined && (
        <button type="button" className={styles.front} onClick={onFront}>
          {refusal.surface === "container"
            ? "Open this page in my own browser"
            : "Bring the window to the front"}
        </button>
      )}
    </div>
  );
}

/**
 * The sandbox, shown in the conversation. Two things make it worth a panel
 * rather than a line of text: you can see the page the agent is on, and when it
 * hits something it must not touch, control visibly moves to you — and while it
 * is yours, the picture becomes a surface you can actually drive.
 */
export function BrowserSessionCard({
  session,
  idleAgent = false,
  fullscreen = false,
  onResume,
  onTakeover,
  onRelay,
  refusal,
  onFront,
  onReconnect,
  onRestart,
}: BrowserSessionCardProps): JSX.Element {
  const handoff = session.handoff;
  // "You can always take over" was true of the host and invisible on screen:
  // the route existed, the card offered no way to reach it, so while Saathi
  // drove, every click landed on a picture. Offered only where there is a real
  // window and the agent is the one holding it.
  const offerWheel =
    !undriven(session) &&
    session.state === "agent-drive" &&
    onTakeover !== undefined;
  // A canned card is never drivable. The reel refuses a relayed click anyway,
  // but offering the surface at all invites the shopper to aim at a window
  // that does not exist.
  const interactive =
    session.sample === undefined &&
    session.state === "user-drive" &&
    onRelay !== undefined;

  return (
    <section
      className={fullscreen ? `${styles.card} ${styles.full}` : styles.card}
      aria-label={`Browser session on ${session.merchant}`}
    >
      {session.sample !== undefined && <Sample sample={session.sample} />}

      <Chrome session={session} idleAgent={idleAgent} />

      <div className={styles.viewTools}>
        {onRestart !== undefined && undriven(session) && (
          <button type="button" className={styles.viewTool} onClick={onRestart}>
            Open this window again
          </button>
        )}
        {onReconnect !== undefined && !undriven(session) && (
          <button
            type="button"
            className={styles.viewTool}
            onClick={onReconnect}
          >
            Reconnect view
          </button>
        )}
      </div>

      {session.notice !== undefined && (
        <div className={styles.refusal} role="alert">
          <p className={styles.refusalLine}>{session.notice}</p>
        </div>
      )}

      {offerWheel && (
        <div className={styles.takeover}>
          <button type="button" className={styles.resume} onClick={onTakeover}>
            Take the wheel
          </button>
          <span className={styles.takeoverNote}>
            Saathi stops where it is and the window becomes yours to click and
            type in. Nothing you do in it is bought through Saathi.
          </span>
        </div>
      )}

      {interactive && (
        <details className={styles.outsideNote}>
          {/* The two load-bearing sentences stay visible; the mechanics wait
              behind a fold. Five sentences of safety copy buried the two
              that matter. */}
          <summary className={styles.outsideSummary}>
            Anything you buy on this page is bought here, not through Saathi.
            No rule you signed applies, and it will not appear in your ledger.
          </summary>
          While the window is yours it shows everything on it, including what
          you type. The picture goes to this tab and is never written down.
          Saathi still cannot touch a password or a card number on this page,
          and the moment you hand the window back those fields are painted out
          of the picture again.
        </details>
      )}

      <div className={styles.viewport}>
        <LiveViewport
          session={session}
          interactive={interactive}
          onRelay={onRelay ?? (() => undefined)}
        />
        {handoff !== undefined && !interactive && (
          <span className={styles.dim} aria-hidden="true" />
        )}
      </div>

      {refusal !== null && refusal !== undefined && (
        <Refused refusal={refusal} onFront={onFront} />
      )}

      {handoff !== undefined && (
        <div className={styles.handoff} role="alert">
          <p className={styles.handoffTitle}>
            {HANDOFF_TITLE[handoff.reason] ?? "Take over"}
          </p>
          <p className={styles.handoffAsk}>{handoff.ask}</p>
          {handoff.readiness !== undefined && (
            <p className={styles.readiness}>{handoff.readiness}</p>
          )}
          {interactive && (
            <p className={styles.readiness}>
              Click and type in the picture above and it reaches the real
              window. Anything the classifier calls yours alone is refused here
              and stays in that window.
            </p>
          )}
          {/* A restored card keeps the handoff's words as the record of what
              was asked, but never the button: "carry on" on a window this
              page has no hold on is a control that looks alive and is not. */}
          {!undriven(session) && (
            <button type="button" className={styles.resume} onClick={onResume}>
              I&rsquo;m done, carry on
            </button>
          )}
        </div>
      )}

      <ol className={styles.actions}>
        {session.actions.map((action) => (
          <li
            key={action.id}
            className={
              action.outcome === "refused"
                ? `${styles.action} ${styles.refused}`
                : styles.action
            }
          >
            <span className={styles.mark} aria-hidden="true">
              {action.outcome === "refused" ? "✕" : "✓"}
            </span>
            <span>
              {action.label}
              {action.actor === "user" && (
                <span className={styles.byYou}> · you</span>
              )}
              {action.reason !== undefined && (
                <span className={styles.reason}>{action.reason}</span>
              )}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
