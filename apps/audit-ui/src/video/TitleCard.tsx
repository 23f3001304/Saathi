// §1.2/§8 — the video's 0:00 asset. Not mounted anywhere in the routed app
// (no <TitleCard/> import exists in App.tsx); this file exists solely as
// the one permitted importer of --saffron (R4/D25).
import type { JSX } from "react";
import styles from "./TitleCard.module.css";

// DECISION: no Bakhshali manuscript scan asset was fetched for this build
// (out of scope for the judged UI — this component is never rendered in
// the app). The gradient below stands in for the texture; swap in the
// Bodleian public-domain scan as a background-image when producing the video.
export function TitleCard(): JSX.Element {
  return (
    <div className={styles.card}>
      <h1 className={styles.title}>Covenant</h1>
      <p className={styles.subtitle}>
        India gave the ledger its zero. This is what it looks like when an
        agent's spending has one too.
      </p>
    </div>
  );
}
