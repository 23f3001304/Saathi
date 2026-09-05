import type { JSX } from "react";
import { Show } from "./Show.tsx";
import styles from "./App.module.css";

export function App(): JSX.Element {
  return (
    <div className={styles.page}>
      <Show />
    </div>
  );
}
