import type { JSX } from "react";
import styles from "./Timestamp.module.css";

type TimestampProps = {
  iso: string;
  variant?: "absolute" | "relative";
  now?: number;
};

function hhmmssSSS(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number, len = 2): string => String(n).padStart(len, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
}

/** §6.4 — used by MemoryRail.age; coarse buckets, no fake precision. */
export function relativeTime(iso: string, now: number): string {
  const deltaMs = now - new Date(iso).getTime();
  const minutes = Math.floor(deltaMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/** §6.4 — millisecond precision by default; full ISO surfaces via title. */
export function Timestamp({
  iso,
  variant = "absolute",
  now,
}: TimestampProps): JSX.Element {
  const label =
    variant === "relative"
      ? relativeTime(iso, now ?? Date.now())
      : hhmmssSSS(iso);
  return (
    <time className={styles.timestamp} dateTime={iso} title={iso}>
      {label}
    </time>
  );
}
