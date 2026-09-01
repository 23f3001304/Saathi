import type { JSX } from "react";
import { TopBar } from "./TopBar.tsx";
import { useRoute, type Route } from "../router/useRoute.ts";
import { useShopData } from "../data/useShopData.ts";
import { useSigningKey } from "../data/useSigningKey.ts";
import { Chat } from "../conversation/Chat.tsx";
import {
  BriefingPage,
  DemandPage,
  LeakagePage,
  StandingPage,
} from "../screens/FoldPages.tsx";
import { ListingsPage } from "../screens/ListingsPage.tsx";
import { OrdersPage } from "../screens/OrdersPage.tsx";
import { SettingsPage } from "../screens/SettingsPage.tsx";
import type { Shop } from "../auth/types.ts";
import styles from "./Desk.module.css";

/**
 * A bar, and under it the conversation — or, if the shopkeeper went looking
 * for one, a page. Everything is scoped to `shop`: there is no hardcoded
 * merchant left anywhere in this app.
 */
export function Desk({ shop }: { shop: Shop }): JSX.Element {
  const { route, navigate } = useRoute();
  const data = useShopData(shop);
  const signingKey = useSigningKey(shop);
  const canSign = signingKey.heldKid !== null;

  function openListing(itemId: string | null): void {
    navigate(
      itemId === null ? { name: "listings" } : { name: "listing", itemId },
    );
  }

  return (
    <div className={styles.shell}>
      <TopBar
        route={route}
        heldKid={signingKey.heldKid}
        onNavigate={navigate}
      />
      {pageFor(route, { shop, data, signingKey, canSign, openListing })}
    </div>
  );
}

type PageDeps = {
  shop: Shop;
  data: ReturnType<typeof useShopData>;
  signingKey: ReturnType<typeof useSigningKey>;
  canSign: boolean;
  openListing: (itemId: string | null) => void;
};

function pageFor(route: Route, deps: PageDeps): JSX.Element {
  const { shop, data, canSign } = deps;
  switch (route.name) {
    case "listings":
    case "listing":
      return (
        <ListingsPage
          data={data}
          openItemId={route.name === "listing" ? route.itemId : null}
          canSign={canSign}
          onOpen={deps.openListing}
        />
      );
    case "orders":
      return <OrdersPage data={data} />;
    case "standing":
      return <StandingPage data={data} shopSlug={shop.slug} />;
    case "briefing":
      return <BriefingPage data={data} shopSlug={shop.slug} />;
    case "demand":
      return <DemandPage data={data} shopSlug={shop.slug} />;
    case "leakage":
      return <LeakagePage data={data} shopSlug={shop.slug} />;
    case "settings":
      return (
        <SettingsPage
          shop={shop}
          signingKey={deps.signingKey}
          live={data.desk.data?.live ?? false}
        />
      );
    default:
      return (
        <div className={styles.room}>
          <Chat
            data={data}
            shopSlug={shop.slug}
            canSign={canSign}
            onOpenListing={deps.openListing}
          />
        </div>
      );
  }
}
