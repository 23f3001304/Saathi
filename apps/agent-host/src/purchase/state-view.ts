import type {
  AppState,
  CatalogSku,
  OnScreenOption,
  PlannerReads,
  ShelfRow,
  ShelfSight,
  ShelfView,
} from "@covenant/agents";
import type { SessionState } from "@covenant/browser-drive";

import type { WebListingView } from "../browser/web-listing.js";
import type { CovenantEdits } from "../covenant/amend-bounds.js";
import type { VaultRow } from "../session/credential-vault.js";
import type { ContextView } from "./context-record.js";
import type { CheckoutSources, GateViews } from "./state-view-parts.js";
import {
  checkoutOf,
  covenantOf,
  pendingOf,
  windowOwnerOf,
} from "./state-view-parts.js";

/** Everything a read may look at. Structural on purpose, like `SandboxOwner`:
 *  this file must not learn how a park or a vault is built, only what each
 *  one shows. The vault's face here is `list()` alone; `read()` is the
 *  sign-in routine's and no model-facing object holds it. */
export interface StateSources extends CheckoutSources {
  readonly shelf: ShelfView;
  readonly merchantId: string;
  readonly offered: { current(): readonly WebListingView[] };
  readonly browser: { current(): { currentState(): SessionState } | null };
  /** The standing covenant, from the gateway: the source of truth, not a
   *  copy the host keeps. */
  readonly covenant: () => Promise<CovenantEdits>;
  readonly gates: GateViews;
  readonly vault: { list(): Promise<readonly VaultRow[]> };
  readonly context: ContextView;
  readonly language: { current(): string | null };
}

/** Host-read facts only. The floor price is the merchant's to keep, the
 *  stock count is theirs to state in a quote, and the description is P0
 *  prose the catalog tool already quarantines. */
function rowOf(item: CatalogSku): ShelfRow {
  return {
    sku: item.sku,
    label: item.label,
    category: item.category,
    list_price_paise: item.listPricePaise,
    currency: item.currency,
    image_url: item.imageUrl,
  };
}

function optionOf(listing: WebListingView): OnScreenOption {
  return {
    ref: listing.ref,
    title: listing.title,
    price_text: listing.price_text,
    url: listing.url,
    source: "web",
  };
}

/**
 * The planner's reads, answered from what this host actually holds.
 *
 * DECISION: the covenant is fetched on every `state()` rather than cached.
 * An amendment signs on the gateway and nothing tells this lane; a read that
 * answered from a copy would tell the shopper their old cap after they had
 * raised it. One request per look is the price of never being stale.
 */
export class HostStateView implements PlannerReads {
  constructor(private readonly sources: StateSources) {}

  shelf(): Promise<ShelfSight> {
    return Promise.resolve({
      merchant: this.sources.merchantId,
      rows: this.sources.shelf.current().map(rowOf),
    });
  }

  async state(): Promise<AppState> {
    const sources = this.sources;
    const window = windowOwnerOf(
      sources.browser.current()?.currentState() ?? null,
    );
    const [edits, signIns] = await Promise.all([
      sources.covenant(),
      sources.vault.list(),
    ]);
    return {
      language_setting: sources.language.current(),
      on_screen: {
        options: sources.offered.current().map(optionOf),
        picked: this.picked(),
      },
      checkout: checkoutOf(sources, window),
      covenant: covenantOf(edits, pendingOf(sources.gates)),
      sign_ins: signIns.map((row) => ({
        host: row.host,
        username: row.username,
      })),
      earlier_dialogue_summary: sources.context.current()?.summary ?? null,
    };
  }

  /** The parked card, resolved against the host's own record of it. */
  private picked(): AppState["on_screen"]["picked"] {
    const ref = this.sources.park.held;
    if (ref === null) return null;
    const listing = this.sources.findings.find(ref);
    return listing === null
      ? null
      : { ref, title: listing.title, url: listing.url };
  }
}
