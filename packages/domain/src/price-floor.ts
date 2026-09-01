import type { CartLine } from "./cart.js";
import type { IsoTimestamp } from "./iso-timestamp.js";

/**
 * The band a merchant signed for one SKU: the listed claim it sits under, and
 * the lowest price an agent may settle at without asking a human (§5.2).
 *
 * Both numbers travel together because a floor alone is not a band. The list
 * is recorded as at the moment of declaration, so "settled below list" is a
 * comparison against the number the merchant was looking at when they granted
 * the authority — not against a provider field that may have moved since.
 */
export interface SkuPriceFloor {
  readonly merchant_id: string;
  readonly sku_id: string;
  readonly floor_paise: number;
  readonly list_paise: number;
  readonly currency: string;
  readonly declared_at: IsoTimestamp;
  /** kid of the merchant key whose signature admitted the declaration. */
  readonly declared_by: string;
}

export function floorFor(
  floors: readonly SkuPriceFloor[],
  skuId: string,
): SkuPriceFloor | null {
  return floors.find((floor) => floor.sku_id === skuId) ?? null;
}

/**
 * A unit price the merchant's own declaration permits. A currency that does
 * not match the declared one fails: a floor of 1700 INR says nothing about
 * 1700 of anything else, and reading it as though it did would be inferring a
 * bound the merchant never signed.
 */
export function clearsFloor(
  floor: SkuPriceFloor,
  unitPaise: number,
  currency: string,
): boolean {
  return floor.currency === currency && unitPaise >= floor.floor_paise;
}

/**
 * The first cart line its merchant's own declaration forbids, or `null` when
 * every line sits inside its band. A SKU with no declared floor has no bound
 * here: a floor is never inferred, so silence means "no discount authority",
 * which the quote tool already enforces by signing at list.
 */
export function belowFloorLine(
  lines: readonly CartLine[],
  floors: readonly SkuPriceFloor[],
  currency: string,
): CartLine | null {
  return (
    lines.find((line) => {
      const floor = floorFor(floors, line.sku);
      return floor !== null && !clearsFloor(floor, line.unitPaise, currency);
    }) ?? null
  );
}

/**
 * The single ask a buyer's agent may make: as much discount as the buyer's
 * signed ceiling requires and no more, never below the merchant's floor.
 * `null` when the band cannot reach the ceiling, because an ask that still
 * fails is an ask that should never leave.
 */
export function askUnitPaise(band: {
  readonly listPaise: number;
  readonly floorPaise: number;
  readonly capPaise: number;
  readonly qty: number;
}): number | null {
  if (band.qty < 1 || band.listPaise * band.qty <= band.capPaise) {
    return null;
  }
  const needed = Math.floor(band.capPaise / band.qty);
  return needed >= band.floorPaise ? needed : null;
}
