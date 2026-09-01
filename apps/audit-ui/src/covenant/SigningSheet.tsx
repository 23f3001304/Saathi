// §2.5 O1 / §3.3 — hold-to-sign → rosette draws itself. Escape/backdrop
// click aborts silently (no toast); this is the one irreversible act.
import {
  useEffect,
  useState,
  type CSSProperties,
  type JSX,
  type KeyboardEvent,
} from "react";
import type { RosetteStage } from "../kolam/Rosette.tsx";
import { HoldToSign } from "./HoldToSign.tsx";
import { SaathiMark } from "../chrome/SaathiMark.tsx";
import { useReducedMotion } from "../motion/useReducedMotion.ts";
import styles from "./SigningSheet.module.css";

export type ConstraintLine = { label: string; value: string };

type SigningSheetProps = {
  title: string;
  description: string;
  lines: ConstraintLine[];
  thumbprint: string;
  onSigned: () => void;
  onAbort: () => void;
};

const SETTLE_DELAY_MS = 700;

function Thumbprint({
  value,
  reducedMotion,
}: {
  value: string;
  reducedMotion: boolean;
}): JSX.Element {
  if (reducedMotion) return <p className={styles.thumbprint}>{value}</p>;
  return (
    <p className={styles.thumbprint}>
      {[...value].map((char, i) => (
        <span key={i} style={{ "--i": i } as CSSProperties}>
          {char}
        </span>
      ))}
    </p>
  );
}

export function SigningSheet({
  title,
  description,
  lines,
  thumbprint,
  onSigned,
  onAbort,
}: SigningSheetProps): JSX.Element {
  const reducedMotion = useReducedMotion();
  const [rosetteStage, setRosetteStage] = useState<RosetteStage>("idle");
  const [signed, setSigned] = useState(false);

  useEffect(() => {
    if (!signed) return;
    const id = setTimeout(onSigned, reducedMotion ? 100 : SETTLE_DELAY_MS);
    return () => clearTimeout(id);
  }, [signed, onSigned, reducedMotion]);

  function handleComplete(): void {
    setRosetteStage("drawing");
    setSigned(true);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>): void {
    if (e.key === "Escape") onAbort();
  }

  return (
    // Escape (bound below) is the keyboard path; the backdrop click is a
    // mouse-only convenience layered on top of it, same as most dialogs.
    <div
      className={styles.backdrop}
      onClick={onAbort}
      onKeyDown={handleKeyDown}
    >
      <div
        className={styles.sheet}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.brand}>
          <SaathiMark size={18} />
          <span>Saathi</span>
        </div>
        <h2 className={styles.title}>{title}</h2>
        <div className={styles.lines}>
          {lines.map((line, i) => (
            <div
              key={line.label}
              className={
                line.label === "Total"
                  ? `${styles.line} ${styles.total}`
                  : styles.line
              }
              style={{ "--i": i } as CSSProperties}
            >
              <span>{line.label}</span>
              <span className={styles.value}>{line.value}</span>
            </div>
          ))}
        </div>
        <p className={styles.description}>{description}</p>
        <HoldToSign
          stage={rosetteStage}
          reducedMotion={reducedMotion}
          onComplete={handleComplete}
        />
        {signed && (
          <Thumbprint value={thumbprint} reducedMotion={reducedMotion} />
        )}
      </div>
    </div>
  );
}
