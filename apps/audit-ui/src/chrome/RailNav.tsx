import type { JSX } from "react";
import type { Route } from "../router/useRoute.ts";
import { Glyph, type GlyphName } from "../primitives/Glyph.tsx";
import styles from "./RailNav.module.css";

type RailNavProps = {
  active: Route["name"];
  onNavigate: (route: Route) => void;
};

const ITEMS: Array<{ route: Route; label: string; glyph: GlyphName }> = [
  { route: { name: "bench" }, label: "Bench", glyph: "hexagon" },
  { route: { name: "covenant" }, label: "Covenant", glyph: "shield" },
  { route: { name: "ledger" }, label: "Ledger", glyph: "chain" },
];

/** §2.0 — active = 2px indigo left rule + ink-90 glyph; inactive ink-40. */
export function RailNav({ active, onNavigate }: RailNavProps): JSX.Element {
  return (
    <nav className={styles.rail} aria-label="Routes">
      {ITEMS.map(({ route, label, glyph }) => {
        const isActive =
          route.name === active ||
          (active === "ledger-sku" && route.name === "ledger");
        return (
          <button
            type="button"
            key={label}
            className={
              isActive ? `${styles.item} ${styles.active}` : styles.item
            }
            onClick={() => onNavigate(route)}
            aria-current={isActive ? "page" : undefined}
          >
            <Glyph name={glyph} />
            <span className={styles.caption}>{label}</span>
          </button>
        );
      })}
    </nav>
  );
}
