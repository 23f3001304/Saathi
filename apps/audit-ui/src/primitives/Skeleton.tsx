import type { JSX } from "react";
import styles from "./Skeleton.module.css";

type SkeletonProps = {
  width?: string;
};

/** No shimmer, no gradient (R6) — a still hairline block while data loads. */
export function Skeleton({ width = "100%" }: SkeletonProps): JSX.Element {
  return (
    <div className={styles.skeleton} style={{ width }} aria-hidden="true" />
  );
}
