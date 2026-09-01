import type { JSX } from "react";
import { useAuth } from "../auth/AuthProvider.tsx";
import { SaathiMark } from "../chrome/SaathiMark.tsx";
import styles from "./SignIn.module.css";

/**
 * Which shop is this? The list is the trust ring the gateway pinned at boot,
 * and nothing else can put a name on it.
 *
 * Choosing selects whose folds to read — public arithmetic over a public
 * ledger. It grants nothing: the console stays read-only until a signing key
 * for that same shop is on this device.
 */
export function ChooseShop(): JSX.Element {
  const { ring, ringLoaded, chooseShop, signOut } = useAuth();

  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <SaathiMark size={44} className={styles.mark} />
        <h1 className={styles.title}>Which shop?</h1>
        <p className={styles.lede}>
          The shops this gateway is set up to trust.
        </p>
        <div className={styles.shops}>
          {ring.map((shop) => (
            <button
              key={shop.slug}
              type="button"
              className={styles.shop}
              onClick={() => chooseShop(shop)}
            >
              <span className={styles.shopSlug}>{shop.slug}</span>
              <span className={styles.shopIssuer}>{shop.issuer}</span>
            </button>
          ))}
          {ring.length === 0 && (
            <p className={styles.empty}>
              {ringLoaded
                ? "No shops yet. Add one, then restart the gateway."
                : "Looking for your shops…"}
            </p>
          )}
        </div>
        <p className={styles.foot}>
          Picking a shop opens its books. Changing a listing needs its key.
        </p>
        <button type="button" className={styles.linkButton} onClick={signOut}>
          Sign out instead
        </button>
      </div>
    </main>
  );
}
