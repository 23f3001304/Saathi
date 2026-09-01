import { useState, type JSX } from "react";
import { useAuth } from "../auth/AuthProvider.tsx";
import type { AuthProfile } from "../auth/types.ts";
import styles from "./AccountMenu.module.css";

/**
 * The account, honestly scoped: who you are (a Google name), what can
 * actually act (a signing key), what pays (a consent, held by Razorpay,
 * never by us), where things go, and the door out. Identity and key are two
 * rows and not one because they are two different things.
 *
 * Payment and delivery stay fixtures — they belong to the demo dataset, not
 * to sign-in.
 */
const FIXTURE = {
  payment: "UPI Reserve Pay · up to ₹2,000 per purchase",
  address: "14 Cunningham Road, Bengaluru 560052",
};

function describeIdentity(profile: AuthProfile): string {
  if (profile.kind === "demo") return "Demo identity · this browser only";
  return profile.email === "" ? "Google" : `Google · ${profile.email}`;
}

export function AccountMenu({
  onNavigate,
}: {
  onNavigate?: (to: "settings" | "covenant") => void;
}): JSX.Element {
  const [open, setOpen] = useState(false);
  const { profile, signingKey, signOut } = useAuth();
  const name = profile?.name ?? "You";

  return (
    <div className={styles.wrap}>
      <button
        type="button"
        className={styles.avatar}
        aria-label="Account"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {name[0]}
      </button>
      {open && (
        <div className={styles.panel} role="dialog" aria-label="Account">
          <p className={styles.name}>{name}</p>
          <dl className={styles.rows}>
            <div className={styles.row}>
              <dt>Signed in with</dt>
              <dd>{profile === null ? "Nobody" : describeIdentity(profile)}</dd>
            </div>
            <div className={styles.row}>
              <dt>Signing key</dt>
              <dd className={styles.mono}>
                {signingKey === null
                  ? "none — nothing can be bought"
                  : signingKey.thumbprint}
              </dd>
            </div>
            <div className={styles.row}>
              <dt>Pays with</dt>
              <dd>{FIXTURE.payment}</dd>
            </div>
            <div className={styles.row}>
              <dt>Delivers to</dt>
              <dd>{FIXTURE.address}</dd>
            </div>
          </dl>
          <p className={styles.note}>
            The sign-in says who you are; only the key can approve a purchase.
            Card and UPI details stay with Razorpay.
          </p>
          <div className={styles.actions}>
            <button
              type="button"
              className={styles.action}
              onClick={() => {
                setOpen(false);
                onNavigate?.("settings");
              }}
            >
              Settings
            </button>
            <button
              type="button"
              className={styles.action}
              onClick={() => {
                setOpen(false);
                onNavigate?.("covenant");
              }}
            >
              Rules
            </button>
            <button
              type="button"
              className={`${styles.action} ${styles.quiet}`}
              onClick={() => {
                setOpen(false);
                signOut();
              }}
            >
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
