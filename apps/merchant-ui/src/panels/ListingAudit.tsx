import type { JSX } from "react";
import { Chip } from "../primitives/Chip.tsx";
import type { ListingAuditView } from "../api/merchantTypes.ts";
import { CUE_LABELS } from "../api/merchantTypes.ts";
import styles from "./ListingAudit.module.css";

type ListingAuditProps = { audit: ListingAuditView };

/**
 * The shop's own copy, read by the detector a buyer agent runs. Not a second
 * opinion about the listings — literally the finding the agent will make.
 *
 * A cue is not an accusation: "last few left" may be perfectly true. It is
 * shown with the bias it works on and the answer the agent already has, so a
 * merchant can decide whether the sentence is worth what it costs them.
 */
function cleanLine(clean: number, total: number): string {
  if (total === 1) {
    return clean === 1
      ? "Your one listing is clean."
      : "Your one listing is not clean.";
  }
  return `${clean.toString()} of ${total.toString()} listings are clean.`;
}

function flaggedLine(flagged: number): string {
  return flagged === 1
    ? "One carries a line that buyers' agents flag."
    : `${flagged.toString()} carry a line that buyers' agents flag.`;
}

export function ListingAudit({ audit }: ListingAuditProps): JSX.Element {
  const flagged = audit.listings.filter((listing) => listing.cues.length > 0);
  return (
    <div className={styles.audit}>
      <p className={styles.summary}>
        {cleanLine(audit.clean, audit.listings.length)}{" "}
        {flagged.length > 0 && flaggedLine(flagged.length)}
      </p>
      {flagged.map((listing) => (
        <section className={styles.listing} key={listing.itemId}>
          <h3 className={styles.name}>{listing.name}</h3>
          {listing.cues.map((cue) => (
            <div className={styles.cue} key={`${listing.itemId}-${cue.kind}`}>
              <div className={styles.cueHead}>
                <Chip variant="crimson">
                  {CUE_LABELS[cue.kind] ?? cue.kind}
                </Chip>
                <span className={styles.phrase}>
                  &ldquo;{cue.phrase}&rdquo;
                </span>
              </div>
              <p className={styles.bias}>{cue.bias}</p>
              <p className={styles.counter}>{cue.counter}</p>
            </div>
          ))}
        </section>
      ))}
      <p className={styles.moral}>
        None of this blocks a sale. A buyer&rsquo;s agent already has its limits
        in writing, so the line wins you nothing and costs you its trust.
      </p>
    </div>
  );
}
