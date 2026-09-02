import { SignInVault } from "./SignInVault.tsx";
import { useState, type JSX } from "react";
import { useAuth } from "../auth/AuthProvider.tsx";
import { authorityNote } from "../auth/authority.ts";
import type { AuthProfile, SigningKeyRecord } from "../auth/types.ts";
import { StreamText } from "../conversation/StreamText.tsx";
import styles from "./Settings.module.css";

type Field = { key: string; label: string; value: string; note?: string };

const PAYMENT: Field[] = [
  {
    key: "method",
    label: "Pays with",
    value: "UPI Reserve Pay · up to ₹2,000 per purchase",
    note: "Your UPI details stay with Razorpay. I never see them.",
  },
];

const DELIVERY: Field[] = [
  {
    key: "address",
    label: "Delivers to",
    value: "14 Cunningham Road, Bengaluru 560052",
    note: "A merchant only gets this when you sign a bill.",
  },
];

/**
 * The linked identity, said plainly. Two rows, never merged into one: the
 * account that names you and the key that acts for you are different
 * objects with different powers, and a settings page that blurred them
 * would be teaching the wrong model of the product.
 */
function linkedAccountField(profile: AuthProfile | null): Field {
  if (profile === null) {
    return { key: "google", label: "Signed in with", value: "Nobody" };
  }
  if (profile.kind === "demo") {
    return {
      key: "google",
      label: "Signed in with",
      value: "Demo identity · this browser only",
      note: "A made-up identity, in this browser and nowhere else. Like a real sign-in, it cannot buy anything.",
    };
  }
  return {
    key: "google",
    label: "Signed in with",
    value: profile.email === "" ? "Google" : `Google · ${profile.email}`,
    note: "Google says who you are, and nothing more. It cannot approve a purchase.",
  };
}

function signingKeyField(key: SigningKeyRecord | null): Field {
  if (key === null) {
    return {
      key: "key",
      label: "Signing key",
      value: "none",
      note: "Until you have a key, nothing can be bought in your name.",
    };
  }
  return {
    key: "key",
    label: "Signing key",
    value: key.thumbprint,
    note: "Made on this device, by you. Nothing is bought in your name without it.",
  };
}

function Section({
  title,
  fields,
  editable,
  footer,
}: {
  title: string;
  fields: Field[];
  editable?: boolean;
  footer?: string;
}): JSX.Element {
  const [values, setValues] = useState(
    Object.fromEntries(fields.map((f) => [f.key, f.value])),
  );
  const [editing, setEditing] = useState<string | null>(null);

  return (
    <section className={styles.section}>
      <h2 className={styles.heading}>{title}</h2>
      {fields.map((f) => (
        <div key={f.key} className={styles.field}>
          <span className={styles.label}>{f.label}</span>
          {editing === f.key ? (
            <input
              className={styles.input}
              value={values[f.key]}
              autoFocus
              onChange={(e) =>
                setValues((prev) => ({ ...prev, [f.key]: e.target.value }))
              }
              onBlur={() => setEditing(null)}
              onKeyDown={(e) => e.key === "Enter" && setEditing(null)}
            />
          ) : (
            <span className={styles.value}>
              {values[f.key]}
              {editable === true && (
                <button
                  type="button"
                  className={styles.edit}
                  onClick={() => setEditing(f.key)}
                >
                  Edit
                </button>
              )}
            </span>
          )}
          {f.note !== undefined && <p className={styles.note}>{f.note}</p>}
        </div>
      ))}
      {footer !== undefined && <p className={styles.note}>{footer}</p>}
    </section>
  );
}

export function Settings(): JSX.Element {
  const session = useAuth();
  const identity: Field[] = [
    { key: "name", label: "Name", value: session.profile?.name ?? "You" },
    linkedAccountField(session.profile),
    signingKeyField(session.signingKey),
  ];

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>What I hold for you</h1>
      <p className={styles.voice}>
        <StreamText text="And where the rest of it lives." />
      </p>
      <Section title="You" fields={identity} footer={authorityNote(session)} />
      <Section title="Payment" fields={PAYMENT} />
      <Section title="Delivery" fields={DELIVERY} editable />
      <SignInVault />
      <section className={styles.section}>
        <h2 className={styles.heading}>Your data</h2>
        <p className={styles.note}>
          Everything I do goes on the ledger, and it is yours to read. Sharing
          anonymised totals is off; you can turn it on under Rules, where it
          needs your signature like everything else.
        </p>
      </section>
    </div>
  );
}
