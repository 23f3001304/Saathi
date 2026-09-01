import type { JSX } from "react";
import { useAuth } from "../auth/AuthProvider.tsx";
import { SaathiMark } from "../chrome/SaathiMark.tsx";
import styles from "./SignIn.module.css";

/**
 * First run. The screen has one job beyond letting someone in: to say, in
 * the assistant's own voice and before anyone has committed to anything,
 * that identity and authority are different things here. A person who reads
 * only this page should already know that a stolen Google session cannot
 * spend their money.
 */
function GoogleAffordance(): JSX.Element {
  const { attachRef, error } = useAuth();
  return (
    <div className={styles.affordance}>
      {/* Google's own rendered button, per the GIS reference. Their branding
          requirements do not allow a look-alike, and a look-alike would be
          the wrong thing to build anyway. */}
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
        There is no Google sign-in in this build. A demo user is a made-up
        identity that lives in this browser and nowhere else: not a Google
        account, and not anybody.
      </p>
      <button type="button" className={styles.demoButton} onClick={signIn}>
        Continue as a demo user
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
        <h1 className={styles.title}>Namaste.</h1>
        <p className={styles.lede}>I do the shopping. You hold the pen.</p>
        <p className={styles.body}>
          Before anything else, tell me who you are.
        </p>
        <dl className={styles.contract}>
          <div className={styles.clause}>
            <dt>What signing in does</dt>
            <dd>
              Puts your name to this browser, so every line on the ledger
              belongs to someone.
            </dd>
          </div>
          <div className={styles.clause}>
            <dt>What signing in cannot do</dt>
            <dd className={styles.emphasis}>
              Buy anything. Google can vouch that you are you; it cannot spend a
              rupee. Only the key you make next can, and I will ask you to hold
              it down every single time.
            </dd>
          </div>
        </dl>
        {identityKind === "google" ? <GoogleAffordance /> : <DemoAffordance />}
        <p className={styles.foot}>
          No card, no UPI handle, no password passes through Saathi. I hold a
          key, never your money.
        </p>
      </div>
    </main>
  );
}
