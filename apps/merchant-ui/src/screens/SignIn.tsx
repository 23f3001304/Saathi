import type { JSX } from "react";
import { useAuth } from "../auth/AuthProvider.tsx";
import { SaathiMark } from "../chrome/SaathiMark.tsx";
import styles from "./SignIn.module.css";

/**
 * The doorstep. Beyond letting a shopkeeper in, it says one thing: this
 * sign-in opens a set of books and does not hand over a shop.
 */
function GoogleAffordance(): JSX.Element {
  const { attachRef, error } = useAuth();
  return (
    <div className={styles.affordance}>
      {/* Google's own rendered button, per the GIS reference. Their branding
          requirements do not allow a look-alike. */}
      <div ref={attachRef} />
      {error !== null && error !== "" && (
        <p className={styles.error} role="status">
          {error}
        </p>
      )}
    </div>
  );
}

function DemoAffordance(): JSX.Element {
  const { signIn } = useAuth();
  return (
    <div className={styles.affordance}>
      <p className={styles.demoNote}>
        There is no Google sign-in in this build. A demo shopkeeper is a
        made-up identity, and it can change exactly as much as a real one:
        nothing, without a key.
      </p>
      <button type="button" className={styles.demoButton} onClick={signIn}>
        Continue as a demo shopkeeper
      </button>
    </div>
  );
}

export function SignIn(): JSX.Element {
  const { identityKind } = useAuth();

  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <SaathiMark size={44} className={styles.mark} />
        <h1 className={styles.title}>Saathi for shops</h1>
        <p className={styles.lede}>Why AI buyers do, and do not, pick you.</p>
        <dl className={styles.contract}>
          <div className={styles.clause}>
            <dt>Signing in opens</dt>
            <dd>
              How buyers rate you, the searches you could not serve, the sales
              that were turned down, and your listings as an agent reads them.
            </dd>
          </div>
          <div className={styles.clause}>
            <dt>Signing in cannot</dt>
            <dd className={styles.emphasis}>
              Change a listing. Google can vouch that you are you; it cannot say
              a shop is yours. Only your signing key does that.
            </dd>
          </div>
        </dl>
        {identityKind === "google" ? <GoogleAffordance /> : <DemoAffordance />}
        <p className={styles.foot}>
          This app never spends anything and never holds your money. The only
          thing it signs is a change to your own shelf.
        </p>
      </div>
    </main>
  );
}
