import type { Database as SqliteDatabase, Statement } from "better-sqlite3";

import type { IsoTimestamp, SkuPriceFloor } from "@covenant/domain";

export interface FloorDeclaration {
  readonly tenantId: string;
  readonly merchantId: string;
  readonly skuId: string;
  readonly floorPaise: number;
  readonly listPaise: number;
  readonly currency: string;
  readonly declaredAt: IsoTimestamp;
  readonly declaredBy: string;
  readonly eventId: string;
}

interface FloorRow {
  readonly merchant_id: string;
  readonly sku_id: string;
  readonly floor_paise: number;
  readonly list_paise: number;
  readonly currency: string;
  readonly declared_at: string;
  readonly declared_by: string;
}

const DECLARE_SQL = `
  INSERT INTO sku_price_floors
    (tenant_id, merchant_id, sku_id, floor_paise, list_paise, currency,
     declared_at, declared_by, event_id)
  VALUES (@tenantId, @merchantId, @skuId, @floorPaise, @listPaise, @currency,
          @declaredAt, @declaredBy, @eventId)
  ON CONFLICT(tenant_id, sku_id) DO UPDATE SET
    merchant_id = excluded.merchant_id,
    floor_paise = excluded.floor_paise,
    list_paise  = excluded.list_paise,
    currency    = excluded.currency,
    declared_at = excluded.declared_at,
    declared_by = excluded.declared_by,
    event_id    = excluded.event_id`;

const CLEAR_SQL =
  "DELETE FROM sku_price_floors WHERE tenant_id = ? AND sku_id = ?";

const FIND_SQL =
  "SELECT * FROM sku_price_floors WHERE tenant_id = ? AND sku_id = ?";

const BY_MERCHANT_SQL =
  "SELECT * FROM sku_price_floors WHERE tenant_id = ? AND merchant_id = ?";

/**
 * The merchant's declared discount authority, per SKU.
 *
 * Reads are synchronous because `VerdictContextBuilder` runs on the read
 * snapshot inside the write transaction, where there is no `await` (§5.3).
 */
export class PriceFloorStore {
  private readonly cache = new Map<string, Statement>();

  constructor(private readonly db: SqliteDatabase) {}

  declare(declaration: FloorDeclaration): void {
    this.statement(DECLARE_SQL).run({ ...declaration });
  }

  /** `true` when a floor was standing and is now gone. */
  clear(tenantId: string, skuId: string): boolean {
    return this.statement(CLEAR_SQL).run(tenantId, skuId).changes === 1;
  }

  find(tenantId: string, skuId: string): SkuPriceFloor | null {
    const row = this.statement(FIND_SQL).get(tenantId, skuId) as
      FloorRow | undefined;
    return row === undefined ? null : floorOf(row);
  }

  /** Only the SKUs asked for, so a cart carries the floors of its own lines. */
  forSkus(
    tenantId: string,
    skuIds: readonly string[],
  ): readonly SkuPriceFloor[] {
    const found = skuIds.map((skuId) => this.find(tenantId, skuId));
    return found.filter((floor): floor is SkuPriceFloor => floor !== null);
  }

  forMerchant(tenantId: string, merchantId: string): readonly SkuPriceFloor[] {
    const rows = this.statement(BY_MERCHANT_SQL).all(
      tenantId,
      merchantId,
    ) as FloorRow[];
    return rows.map((row) => floorOf(row));
  }

  private statement(sql: string): Statement {
    const cached = this.cache.get(sql);
    if (cached !== undefined) {
      return cached;
    }
    const prepared = this.db.prepare(sql);
    this.cache.set(sql, prepared);
    return prepared;
  }
}

function floorOf(row: FloorRow): SkuPriceFloor {
  return {
    merchant_id: row.merchant_id,
    sku_id: row.sku_id,
    floor_paise: row.floor_paise,
    list_paise: row.list_paise,
    currency: row.currency,
    declared_at: row.declared_at,
    declared_by: row.declared_by,
  };
}
