import type { JSX } from "react";
import { SaathiMark } from "./SaathiMark.tsx";
import { useAuth } from "../auth/AuthProvider.tsx";
import type { PageName, Route } from "../router/useRoute.ts";
import styles from "./TopBar.module.css";

// Four destinations, like the shopper's Chat · Rules · Ledger. Briefing,
// demand and leakage keep their URLs and are reached from the conversation.
const LINKS: readonly { page: PageName; label: string }[] = [
  { page: "chat", label: "Chat" },
  { page: "listings", label: "Listings" },
  { page: "orders", label: "Orders" },
  { page: "standing", label: "Standing" },
];

function isActive(route: Route, page: PageName): boolean {
  return route.name === "listing" ? page === "listings" : route.name === page;
}

type TopBarProps = {
  route: Route;
  /** The kid this device can sign with, or null. Never the key. */
  heldKid: string | null;
  onNavigate: (route: Route) => void;
};

/** The shopkeeper's chrome, in the shopper's furniture. */
export function TopBar({
  route,
  heldKid,
  onNavigate,
}: TopBarProps): JSX.Element {
  const { profile, shop, signOut } = useAuth();

  return (
    <header className={styles.bar}>
      <button
        type="button"
        className={styles.brand}
        onClick={() => onNavigate({ name: "chat" })}
      >
        <SaathiMark size={18} />
        Saathi for shops
      </button>
      <nav className={styles.links} aria-label="Sections">
        {LINKS.map((link) => (
          <button
            key={link.page}
            type="button"
            className={
              isActive(route, link.page)
                ? `${styles.link} ${styles.linkActive}`
                : styles.link
            }
            aria-current={isActive(route, link.page) ? "page" : undefined}
            onClick={() => onNavigate({ name: link.page })}
          >
            {link.label}
          </button>
        ))}
      </nav>
      <span className={styles.spacer} />
      <span className={styles.shop}>{shop?.slug ?? ""}</span>
      <span className={heldKid === null ? styles.readOnly : styles.signing}>
        {heldKid === null ? "read only" : "can sign"}
      </span>
      <button
        type="button"
        className={`${styles.link} ${styles.instrument}`}
        aria-current={route.name === "settings" ? "page" : undefined}
        onClick={() => onNavigate({ name: "settings" })}
      >
        {profile === null ? "Settings" : `${profile.name} · Settings`}
      </button>
      <button type="button" className={styles.link} onClick={signOut}>
        Sign out
      </button>
    </header>
  );
}
