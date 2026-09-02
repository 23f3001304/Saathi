import type { JSX } from "react";
import type { Route } from "../router/useRoute.ts";
import { SaathiMark } from "./SaathiMark.tsx";
import { HealthChip, type HealthState } from "./HealthChip.tsx";
import { RangeChip } from "./RangeChip.tsx";
import { AccountMenu } from "./AccountMenu.tsx";
import styles from "./TopBar.module.css";

type TopBarProps = {
  onHealthChange?: (state: HealthState) => void;
  onRangeClick?: () => void;
  active?: Route["name"];
  onNavigate?: (route: Route) => void;
};

/**
 * Brand, liveness, and the attack lane. The chain hash and its Verify
 * control moved to the Ledger route: integrity tooling is for the person
 * auditing, not for everyone buying.
 */
/**
 * Chat is where you spend time; Rules and Ledger are what makes this product
 * different from a chat box that buys things. They were three identical words
 * in a row, so the two that carry the argument looked like ordinary tabs. They
 * are set apart and given weight — a covenant you can read and a record you can
 * replay are the differentiator, and the chrome should say so.
 */
const LINKS: Array<{ route: Route; label: string; instrument?: true }> = [
  { route: { name: "bench" }, label: "Chat" },
  { route: { name: "windows" }, label: "Windows" },
  { route: { name: "orders" }, label: "Orders" },
  { route: { name: "covenant" }, label: "Rules", instrument: true },
  { route: { name: "ledger" }, label: "Ledger", instrument: true },
];

function classesFor(
  route: Route,
  label: string,
  active: Route["name"] | undefined,
  instrument: true | undefined,
): string {
  const on =
    route.name === active ||
    (active === "ledger-sku" && route.name === "ledger");
  return [
    styles.link,
    instrument === true ? styles.instrument : "",
    on ? styles.linkActive : "",
  ]
    .filter(Boolean)
    .join(" ");
}

export function TopBar({
  onHealthChange,
  onRangeClick,
  active,
  onNavigate,
}: TopBarProps): JSX.Element {
  return (
    <header className={styles.bar} data-chrome="true">
      <span className={styles.brand}>
        <SaathiMark size={20} /> Saathi
      </span>
      <HealthChip onStateChange={onHealthChange} />
      <span className={styles.spacer} />
      {onNavigate !== undefined && (
        <nav className={styles.links} aria-label="Views">
          {LINKS.map(({ route, label, instrument }) => (
            <button
              type="button"
              key={label}
              className={classesFor(route, label, active, instrument)}
              onClick={() => onNavigate(route)}
            >
              {label}
            </button>
          ))}
        </nav>
      )}
      <RangeChip onClick={onRangeClick} />
      <AccountMenu onNavigate={(to) => onNavigate?.({ name: to })} />
    </header>
  );
}
