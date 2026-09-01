import { useEffect, useState, type JSX } from "react";
import styles from "./Countdown.module.css";

type CountdownProps = {
  releaseAt: string;
  onElapsed?: () => void;
};

function format(remainingMs: number): { label: string; urgent: boolean } {
  const totalSeconds = Math.max(0, Math.floor(remainingMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (n: number): string => String(n).padStart(2, "0");
  if (totalSeconds < 60)
    return { label: `${pad(minutes)}:${pad(seconds)}`, urgent: true };
  return {
    label: `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`,
    urgent: false,
  };
}

/** §2.4 — recomputes from an absolute timestamp every tick; never decrements
 * a counter, so a throttled background tab cannot drift the number on camera. */
export function Countdown({
  releaseAt,
  onElapsed,
}: CountdownProps): JSX.Element {
  const target = new Date(releaseAt).getTime();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const remaining = target - now;
  useEffect(() => {
    if (remaining <= 0) onElapsed?.();
  }, [remaining <= 0, onElapsed]);

  const { label, urgent } = format(remaining);
  return (
    <span
      className={
        urgent ? `${styles.countdown} ${styles.urgent}` : styles.countdown
      }
    >
      {label}
    </span>
  );
}
