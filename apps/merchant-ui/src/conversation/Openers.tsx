import type { JSX } from "react";
import styles from "./Openers.module.css";

// Same shape as the shopper's openers, same stylesheet, different sentences.
// A shopkeeper opening this is not short of a question, they are short of a
// sense of what this thing will do with one.

type Opener = { prompt: string; why: string; tags: string[] };

const DEFAULTS: readonly Opener[] = [
  {
    prompt: "Why am I not being picked?",
    why: "Ranks what is costing you sales, worst first.",
    tags: ["how buyers see you", "your listing copy"],
  },
  {
    prompt: "What are people asking for that I don't stock?",
    why: "Searches that matched nothing on your shelf.",
    tags: ["searches that found nothing"],
  },
  {
    prompt: "What's waiting on cool-off?",
    why: "Committed, signed, and not yet money.",
    tags: ["orders"],
  },
];

/**
 * Defaults, and said to be defaults. Calling three fixed prompts a reading of
 * this shop would be the exact dishonesty the product exists to refuse.
 */
export function Openers({
  onPick,
}: {
  onPick: (prompt: string) => void;
}): JSX.Element {
  return (
    <div className={styles.openers}>
      <p className={styles.lede}>
        Nothing about your shop chose these, so they are defaults, not
        recommendations.
      </p>
      <ul className={styles.row}>
        {DEFAULTS.map((opener) => (
          <li key={opener.prompt}>
            <button
              type="button"
              className={styles.pill}
              onClick={() => onPick(opener.prompt)}
            >
              <span className={styles.prompt}>{opener.prompt}</span>
              <span className={styles.facts}>
                {opener.tags.map((tag) => (
                  <span key={tag} className={styles.tag}>
                    {tag}
                  </span>
                ))}
              </span>
              <span className={styles.why}>{opener.why}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
