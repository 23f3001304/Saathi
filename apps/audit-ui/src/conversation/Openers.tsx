// The empty chat had nothing to press. A first-time buyer is not short of an
// idea, they are short of a sense of what this thing will do with one — so the
// openers are real sentences, and pressing one starts the run.
import { useEffect, useState, type JSX } from "react";
import { fetchOpeners, type Opener } from "../api/openers.ts";
import { rupeesRounded } from "../primitives/formatMoney.ts";
import { ProductPlate } from "../primitives/ProductPlate.tsx";
import { useAuth } from "../auth/AuthProvider.tsx";
import styles from "./Openers.module.css";

/**
 * Defaults, and said to be defaults. The flywheel needs a ledger to read and
 * k-anonymity suppresses a thin one, so a new user sees these — calling them
 * recommendations would be the exact dishonesty this product exists to refuse.
 */
const DEFAULTS: readonly Opener[] = [
  {
    prompt: "A navy kurta under ₹2,000, refundable",
    why: "Cheap, returnable, and quick to watch end to end.",
    tags: ["clothes", "under ₹2,000", "returnable"],
  },
  {
    prompt: "Running shoes under ₹4,000 from a merchant you trust",
    why: "Shows you which shops have kept their word.",
    tags: ["shoes", "under ₹4,000", "shops you trust"],
  },
  {
    prompt: "The cheapest 3-pack of cotton socks, delivered this week",
    why: "A short run that ends at a bill you can sign.",
    tags: ["clothes", "cheapest first", "this week"],
  },
];

function useOpeners(): { openers: readonly Opener[]; earned: boolean } {
  const { profile } = useAuth();
  const [earned, setEarned] = useState<readonly Opener[]>([]);

  useEffect(() => {
    const subject = profile?.subject;
    if (subject === undefined) return;
    let live = true;
    void fetchOpeners(subject)
      .then((items) => {
        if (live) setEarned(items);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [profile?.subject]);

  return earned.length > 0
    ? { openers: earned, earned: true }
    : { openers: DEFAULTS, earned: false };
}

/** What the request is bounded by — or, once the ledger has something to say,
 *  the merchant and price of a thing that actually exists. */
function Facts({ opener }: { opener: Opener }): JSX.Element | null {
  const facts = [
    ...(opener.merchant === undefined ? [] : [opener.merchant]),
    ...(opener.pricePaise === undefined
      ? []
      : [rupeesRounded(opener.pricePaise)]),
    ...(opener.tags ?? []),
  ];
  if (facts.length === 0) return null;
  return (
    <span className={styles.facts}>
      {facts.map((fact) => (
        <span key={fact} className={styles.tag}>
          {fact}
        </span>
      ))}
    </span>
  );
}

export function Openers({
  onPick,
}: {
  onPick: (prompt: string) => void;
}): JSX.Element {
  const { openers, earned } = useOpeners();

  return (
    <div className={styles.openers}>
      <p className={styles.lede}>
        {earned
          ? "Picked from things you have actually bought."
          : "Nothing to go on yet, so these are defaults, not recommendations."}
      </p>
      <ul className={styles.row}>
        {openers.map((opener) => (
          <li key={opener.prompt}>
            <button
              type="button"
              className={styles.pill}
              onClick={() => onPick(opener.prompt)}
            >
              <ProductPlate sku={opener.prompt} className={styles.plate} />
              <span className={styles.prompt}>{opener.prompt}</span>
              <Facts opener={opener} />
              <span className={styles.why}>{opener.why}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
