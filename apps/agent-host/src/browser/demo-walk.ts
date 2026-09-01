import { fixtureShopUrl } from "@covenant/browser-drive";
import type { GuardedPage } from "@covenant/browser-drive";
import type { Logger } from "@covenant/domain";

import type { BrowserService } from "./browser-service.js";
import type { BrowserSessionView } from "./browser-view.js";

/**
 * Never reaches the page. `GuardedPage` classifies the field before it types,
 * so this string exists only to make the attempt a real one — the journal
 * records its length and nothing else.
 */
const REFUSED_INPUT = "not-a-real-password";

/**
 * A short guarded walk, so the demo starts where the interesting part is.
 *
 * DECISION: every step goes through `GuardedPage` — the agent's own surface,
 * with the agent's own guard. Nothing here is staged: the walk ends at a
 * password field, the classifier refuses it, and the handoff that follows is
 * the real one. That is also what puts the session into `user-drive`, which is
 * the only state the browser relay works in, so the card the user is looking
 * at becomes interactive because a refusal happened and not because a flag
 * was set.
 */
export async function walkToHandoff(
  page: GuardedPage,
  logger: Logger,
): Promise<void> {
  await page.navigate(fixtureShopUrl("index.html"));
  await page.type("#q", "trail shoes");
  await page.navigate(fixtureShopUrl("product.html"));
  await page.click("#add-to-cart");
  await page.navigate(fixtureShopUrl("cart.html"));
  await page.navigate(fixtureShopUrl("login.html"));
  const blocked = await page.type("#password", REFUSED_INPUT);
  logger.info("browser.demo.walk", {
    ended_at: page.url(),
    refused: !blocked.ok,
    rule: blocked.ok ? null : blocked.rule,
  });
}

/**
 * Opens the local fixture shop: a demo that needs no live merchant.
 *
 * A free function over the service rather than a method on it, because it is
 * the demo path and the service is the product. The same shop is reached by
 * two routes — a host directory on the native surface, and the copy baked
 * into the image where the window is in a container.
 */
export async function openFixtureShop(
  service: BrowserService,
  page: string,
  walk: boolean,
  logger: Logger,
): Promise<BrowserSessionView> {
  const guarded = await service.restart();
  const surface = service.current()?.surface() ?? "native-window";
  await guarded.navigate(fixtureShopUrl(page, surface));
  if (walk) await walkToHandoff(guarded, logger);
  return service.card();
}
