// Stored shop sign-ins. The password field is write-only by construction:
// it is posted once, the response echoes host and username only, and no
// route exists that could show it back. What the agent gets is narrower
// still: a tool that types it host-side and cannot read it.
import { useEffect, useState, type JSX } from "react";
import {
  fetchSignIns,
  removeSignIn,
  saveSignIn,
  type VaultRow,
} from "../api/vault.ts";
import styles from "./Settings.module.css";

export function SignInVault(): JSX.Element {
  const [rows, setRows] = useState<readonly VaultRow[]>([]);
  const [host, setHost] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => {
    void fetchSignIns().then(setRows);
  }, []);
  const save = async (): Promise<void> => {
    if (host === "" || username === "" || password === "") return;
    const ok = await saveSignIn(host, username, password);
    setNote(ok ? `Saved for ${host}. The password never shows again.` : "Could not save.");
    setPassword("");
    if (ok) {
      setHost("");
      setUsername("");
      setRows(await fetchSignIns());
    }
  };
  return (
    <section className={styles.section}>
      <h2 className={styles.heading}>Shop sign-ins</h2>
      <p className={styles.note}>
        Stored here, typed by this app into the shop's own sign-in page when
        you send the agent to buy. The agent cannot read them: it can only ask
        this app to sign in, and the ledger records that it happened, never
        what was typed.
      </p>
      {rows.map((row) => (
        <p key={row.host} className={styles.vaultRow}>
          {row.host} · {row.username}{" "}
          <button
            type="button"
            className={styles.vaultForget}
            onClick={() => {
              void removeSignIn(row.host).then(() =>
                fetchSignIns().then(setRows),
              );
            }}
          >
            Forget
          </button>
        </p>
      ))}
      <div className={styles.vaultForm}>
        <input
          className={styles.vaultField}
          placeholder="shop, like amazon.in"
          value={host}
          onChange={(event) => setHost(event.target.value)}
        />
        <input
          className={styles.vaultField}
          placeholder="email or username"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
        />
        <input
          className={styles.vaultField}
          type="password"
          placeholder="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        <button
          type="button"
          className={styles.vaultSave}
          onClick={() => void save()}
        >
          Save
        </button>
      </div>
      {note !== null && <p className={styles.note}>{note}</p>}
    </section>
  );
}
