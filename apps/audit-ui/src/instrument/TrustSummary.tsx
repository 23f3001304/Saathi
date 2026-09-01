// The collapsed face of the Audit Instrument: one sentence and eight small
// marks, standing in for the whole causal chain until someone asks for it.
//
// Progressive disclosure by persona. the buyer's default screen states the
// verdict and gets out of the way; the full instrument (intent, memories,
// digest, the 36px seals mid-stamp, the Razorpay calls, the outcome) is one
// click behind "Inspect". Nothing is deleted, only folded.
import type { JSX } from "react";
import type { SealView } from "../ledger/selectors.ts";
import { Glyph } from "../primitives/Glyph.tsx";
import styles from "./TrustSummary.module.css";

export type TrustSummaryProps = {
  seals: SealView[];
  latencyMs?: number;
  digestVerified: boolean;
  expanded: boolean;
  onToggle: () => void;
};

type Tone = "verified" | "blocked" | "held" | "pending";

const TICK_CLASS: Record<SealView["state"], string> = {
  passed: styles.tickPassed,
  failed: styles.tickFailed,
  held: styles.tickHeld,
  pending: styles.tickPending,
};

/** The mark is a shape as well as a colour. R5/§7.4, colour is never the only channel. */
function Tick({ seal }: { seal: SealView }): JSX.Element {
  // Sized in CSS from --dim-seal-tick; the viewBox is the drawing grid.
  return (
    <svg
      className={`${styles.tick} ${TICK_CLASS[seal.state]}`}
      viewBox="0 0 16 16"
      role="img"
      aria-label={`${seal.check}: ${seal.state}`}
    >
      <circle cx="8" cy="8" r="6.5" className={styles.tickRing} />
      {seal.state === "passed" && (
        <path d="M4.5 8.2 7 10.7 11.5 5.6" className={styles.tickMark} />
      )}
      {seal.state === "failed" && (
        <path d="M5 5 11 11M11 5 5 11" className={styles.tickMark} />
      )}
      {seal.state === "held" && (
        <path d="M8 4.6V8l2.3 1.6" className={styles.tickMark} />
      )}
    </svg>
  );
}

type Summary = { tone: Tone; headline: string; text: string };

/**
 * Two registers, deliberately. The headline is what a buyer needs in order to
 * act. is this safe to sign, is it waiting, did something stop it. The line
 * under it is the engineering, kept because it is true and checkable, but
 * demoted: nobody shopping knows what a digest is, and a screen that leads
 * with "digest verified" is written for its author.
 */
function summarise(
  seals: SealView[],
  latencyMs: number | undefined,
  digestVerified: boolean,
): Summary {
  const failed = seals.find((s) => s.state === "failed");
  if (failed !== undefined) {
    return {
      tone: "blocked",
      headline: "Stopped. Nothing was charged",
      text:
        failed.humanSentence ??
        "One of the checks did not pass. Open it to see which.",
    };
  }
  const passed = seals.filter((s) => s.state === "passed").length;
  if (passed === 0) {
    return {
      tone: "pending",
      headline: "Checking…",
      text: "Nothing is charged until every check clears.",
    };
  }

  const parts = [`${passed} check${passed === 1 ? "" : "s"} passed`];
  if (latencyMs !== undefined) parts.push(`${latencyMs} ms`);
  if (digestVerified) parts.push("memories match");
  const text = parts.join(" · ");

  if (seals.some((s) => s.state === "held")) {
    return {
      tone: "held",
      headline: "Held by your own cool-off rule",
      text: `${text} · cool-off holding`,
    };
  }
  return {
    tone: "verified",
    headline: "Everything checks out",
    text,
  };
}

const TONE_CLASS: Record<Tone, string> = {
  verified: styles.verified,
  blocked: styles.blocked,
  held: styles.held,
  pending: styles.pending,
};

export function TrustSummary({
  seals,
  latencyMs,
  digestVerified,
  expanded,
  onToggle,
}: TrustSummaryProps): JSX.Element {
  const { tone, headline, text } = summarise(seals, latencyMs, digestVerified);

  return (
    <button
      type="button"
      className={`${styles.summary} ${TONE_CLASS[tone]}`}
      onClick={onToggle}
      aria-expanded={expanded}
      aria-controls="audit-instrument"
      data-trust-summary={tone}
    >
      <span className={styles.ticks} aria-hidden={false}>
        {seals.map((seal) => (
          <Tick key={seal.check} seal={seal} />
        ))}
      </span>
      {/* Ink, never a status colour. the AA finding. Tone shows in the rule. */}
      <span className={styles.copy}>
        <span className={styles.headline}>{headline}</span>
        <span className={styles.text}>{text}</span>
      </span>
      <span className={styles.affordance}>
        {expanded ? "Hide" : "Inspect"}
        <span
          className={
            expanded
              ? `${styles.chevron} ${styles.chevronOpen}`
              : styles.chevron
          }
        >
          <Glyph name="chevron" size={12} />
        </span>
      </span>
    </button>
  );
}
