import { useEffect, useState, type JSX } from "react";
import { useAuth } from "../auth/AuthProvider.tsx";
import { SaathiMark } from "../chrome/SaathiMark.tsx";
import { HoldToSign } from "../covenant/HoldToSign.tsx";
import type { RosetteStage } from "../kolam/Rosette.tsx";
import { useReducedMotion } from "../motion/useReducedMotion.ts";
import styles from "./SignIn.module.css";

/**
 * Account creation, which in this product means exactly one thing: making
 * the key. The same hold-to-sign ceremony that signs a bill signs the
 * covenant into existence, on purpose — the first time someone meets the
 * gesture should be the moment they learn it is the only way anything here
 * ever happens.
 */
const SETTLE_MS = 1500;
const SETTLE_REDUCED_MS = 250;

function Made({ thumbprint }: { thumbprint: string }): JSX.Element {
  return (
    <>
      <p className={styles.thumbprint}>{thumbprint}</p>
      <p className={styles.made}>
        Made. That is your pen. You will see this thumbprint on every signature
        I ever put in your name.
      </p>
    </>
  );
}

export function SignInKey(): JSX.Element {
  const { profile, signingKey, status, createKey, enter, error, signOut } =
    useAuth();
  const reducedMotion = useReducedMotion();
  const [stage, setStage] = useState<RosetteStage>("idle");

  useEffect(() => {
    if (status !== "key-created") return;
    const id = setTimeout(enter, reducedMotion ? SETTLE_REDUCED_MS : SETTLE_MS);
    return () => clearTimeout(id);
  }, [status, enter, reducedMotion]);

  function handleComplete(): void {
    setStage("drawing");
    createKey();
  }

  const held =
    profile?.kind === "demo" ? "your demo session" : "your Google account";

  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <SaathiMark size={44} className={styles.mark} />
        <h1 className={styles.title}>Now, the pen.</h1>
        <p className={styles.lede}>
          Hello, {profile?.name ?? "there"}. This is the part that matters.
        </p>
        <p className={styles.body}>
          I am going to make your signing key, here, in this browser. From then
          on, nothing is bought in your name without it — not by me, not by a
          merchant, not by anyone holding {held}.
        </p>
        <dl className={styles.contract}>
          <div className={styles.clause}>
            <dt>Why this is a separate step</dt>
            <dd className={styles.emphasis}>
              A sign-in can be borrowed, phished, or left open on a
              friend&apos;s laptop. None of that spends anything. The key
              spends, and the key only moves when you hold it down yourself.
            </dd>
          </div>
        </dl>
        <div className={styles.ceremony}>
          {signingKey === null ? (
            <HoldToSign
              stage={stage}
              reducedMotion={reducedMotion}
              onComplete={handleComplete}
            />
          ) : (
            <Made thumbprint={signingKey.thumbprint} />
          )}
          {error !== null && error !== "" && (
            <p className={styles.error} role="status">
              {error}
            </p>
          )}
        </div>
        <p className={styles.foot}>
          Not you?{" "}
          <button type="button" className={styles.linkButton} onClick={signOut}>
            Sign out
          </button>
        </p>
      </div>
    </main>
  );
}
