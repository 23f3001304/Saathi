import { useRef, useState, type JSX } from "react";
import { Page } from "./Page.tsx";
import { Hash } from "../primitives/Hash.tsx";
import { useAuth } from "../auth/AuthProvider.tsx";
import type { SigningKeyState } from "../data/useSigningKey.ts";
import type { Shop } from "../auth/types.ts";
import styles from "./SettingsPage.module.css";

// `signingKey`, not `key`: React consumes a prop named `key` and it would
// never reach this component.
type SettingsPageProps = {
  shop: Shop;
  signingKey: SigningKeyState;
  live: boolean;
};

/**
 * The one screen allowed to mention a key file, and it does so in a line.
 *
 * The old console asked a shopkeeper to paste private key material into a
 * textarea before they could touch their own inventory. Now the key arrives
 * once, through the operating system's file picker, and the device remembers a
 * handle it cannot read back out.
 */
function KeyCustody({ state }: { state: SigningKeyState }): JSX.Element {
  const input = useRef<HTMLInputElement>(null);
  const [remember, setRemember] = useState(true);

  if (state.heldKid !== null) {
    return (
      <div className={styles.row}>
        <span className={styles.held}>
          Signing as <Hash value={state.heldKid} label="Signing key id" />
        </span>
        <button type="button" className={styles.quiet} onClick={state.lock}>
          Lock this tab
        </button>
        {state.remembered && (
          <button
            type="button"
            className={styles.danger}
            onClick={state.forget}
          >
            Forget on this device
          </button>
        )}
      </div>
    );
  }

  return (
    <div className={styles.row}>
      <span className={styles.none}>
        No key on this device — you can look, not change.
      </span>
      <input
        ref={input}
        type="file"
        accept=".json,application/json"
        className={styles.file}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file !== undefined) state.unlock(file, remember);
          event.target.value = "";
        }}
      />
      <button
        type="button"
        className={styles.primary}
        disabled={state.busy}
        onClick={() => input.current?.click()}
      >
        {state.busy ? "Reading…" : "Choose your key file"}
      </button>
      <label className={styles.remember}>
        <input
          type="checkbox"
          checked={remember}
          onChange={(event) => setRemember(event.target.checked)}
        />
        <span>remember on this device</span>
      </label>
      {state.problem !== "" && (
        <span className={styles.problem}>{state.problem}</span>
      )}
    </div>
  );
}

export function SettingsPage({
  shop,
  signingKey,
  live,
}: SettingsPageProps): JSX.Element {
  const { profile, ring, leaveShop } = useAuth();

  return (
    <Page title="Settings" live={live} source="the shops we trust">
      <dl className={styles.facts}>
        <div className={styles.fact}>
          <dt>Signed in</dt>
          <dd>
            {profile?.name ?? ""}
            {profile?.kind === "demo" && " · demo identity"}
          </dd>
        </div>
        <div className={styles.fact}>
          <dt>Shop</dt>
          <dd className={styles.mono}>{shop.issuer}</dd>
        </div>
        <div className={styles.fact}>
          <dt>Signing key</dt>
          <dd>
            <KeyCustody state={signingKey} />
          </dd>
        </div>
      </dl>

      <ul className={styles.ring}>
        {ring.map((entry) => (
          <li className={styles.issuer} key={entry.issuer}>
            <span className={styles.mono}>{entry.issuer}</span>
            {entry.kids.map((kid) => (
              <Hash key={kid} value={kid} label="Key id" />
            ))}
          </li>
        ))}
      </ul>
      <p className={styles.note}>
        This list is read when the gateway starts, so a shop added since then
        will not appear until it is restarted.
      </p>

      <button type="button" className={styles.quiet} onClick={leaveShop}>
        Switch shop
      </button>
    </Page>
  );
}
