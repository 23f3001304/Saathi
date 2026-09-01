import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import type { SessionSurface } from "./surface.js";

/**
 * Where the same shop lives inside the sandbox image. A container cannot see
 * the host's disk — that is the point of it — so the offline demo is baked in
 * rather than mounted, and the two surfaces open the same pages by different
 * paths.
 */
export const CONTAINER_FIXTURE_DIR = "/opt/covenant/fixtures/shop";

const MARKER = "fixtures/shop/index.html";
const MAX_CLIMB = 4;

export class FixtureShopMissingError extends Error {
  constructor(from: string) {
    super(
      `The local fixture shop was not found above "${from}". It ships with @covenant/browser-drive at fixtures/shop; without it there is no merchant to demonstrate the sandbox against.`,
    );
    this.name = "FixtureShopMissingError";
  }
}

/**
 * The self-contained shop the sandbox can be demonstrated against with no live
 * merchant and no network. Found by climbing from this module rather than by a
 * fixed relative depth, because `src/` and `dist/src/` sit at different
 * distances from the package root and the host may load either.
 */
export function fixtureShopDir(): string {
  const from = dirname(fileURLToPath(import.meta.url));
  let at = from;
  for (let climb = 0; climb <= MAX_CLIMB; climb += 1) {
    const candidate = resolve(at, "fixtures", "shop");
    if (existsSync(resolve(at, ...MARKER.split("/")))) {
      return candidate;
    }
    at = dirname(at);
  }
  throw new FixtureShopMissingError(from);
}

export function fixtureShopRoot(surface: SessionSurface): string {
  return surface === "container" ? CONTAINER_FIXTURE_DIR : fixtureShopDir();
}

export function fixtureShopUrl(
  page = "index.html",
  surface: SessionSurface = "native-window",
): string {
  if (surface === "container") {
    return `file://${CONTAINER_FIXTURE_DIR}/${page}`;
  }
  return pathToFileURL(resolve(fixtureShopDir(), page)).href;
}
