import type { Clock, EventSink, ReasonCode } from "@covenant/domain";
import { toIsoTimestamp } from "@covenant/domain";
import type { LedgerTransaction } from "@covenant/ledger";

import type { FloorDeclaration, PriceFloorStore } from "./sql/price-floors.js";

export interface FloorCommand {
  readonly tenantId: string;
  readonly merchantId: string;
  readonly skuId: string;
  /** `null` clears: an absent floor is an absent discount authority. */
  readonly floorPaise: number | null;
  readonly listPaise: number;
  readonly currency: string;
  readonly declaredBy: string;
  readonly requestId: string;
}

export type FloorOutcome =
  | { readonly status: "declared"; readonly floorPaise: number }
  | { readonly status: "cleared" }
  | { readonly status: "rejected"; readonly reasonCode: ReasonCode };

/**
 * Setting and clearing a floor, as a money-shaped write: one
 * `BEGIN IMMEDIATE`, the row and its ledger event together, no side effect
 * without its event (§5.1).
 *
 * A floor above the listed price is refused rather than clamped. A merchant
 * who typed the wrong number is told so; silently narrowing it to the list
 * would grant an authority they did not describe.
 */
export class PriceFloorService {
  constructor(
    private readonly floors: PriceFloorStore,
    private readonly events: EventSink,
    private readonly ledger: LedgerTransaction,
    private readonly clock: Clock,
  ) {}

  apply(command: FloorCommand): FloorOutcome {
    const floorPaise = command.floorPaise;
    if (floorPaise === null) {
      return this.ledger.run("gateway.floor.clear", () => this.clear(command));
    }
    if (floorPaise < 1 || floorPaise > command.listPaise) {
      return { status: "rejected", reasonCode: "SCHEMA_VIOLATION" };
    }
    return this.ledger.run("gateway.floor.set", () =>
      this.declare(command, floorPaise),
    );
  }

  private declare(command: FloorCommand, floorPaise: number): FloorOutcome {
    const declaration: FloorDeclaration = {
      tenantId: command.tenantId,
      merchantId: command.merchantId,
      skuId: command.skuId,
      floorPaise,
      listPaise: command.listPaise,
      currency: command.currency,
      declaredAt: toIsoTimestamp(this.clock.now()),
      declaredBy: command.declaredBy,
      eventId: this.append(command, "merchant.floor.set", {
        sku_id: command.skuId,
        merchant_id: command.merchantId,
        floor_paise: floorPaise,
        list_paise: command.listPaise,
        currency: command.currency,
        declared_by: command.declaredBy,
      }),
    };
    this.floors.declare(declaration);
    return { status: "declared", floorPaise };
  }

  private clear(command: FloorCommand): FloorOutcome {
    this.append(command, "merchant.floor.cleared", {
      sku_id: command.skuId,
      merchant_id: command.merchantId,
      declared_by: command.declaredBy,
      had_floor: this.floors.find(command.tenantId, command.skuId) !== null,
    });
    this.floors.clear(command.tenantId, command.skuId);
    return { status: "cleared" };
  }

  private append(
    command: FloorCommand,
    kind: "merchant.floor.set" | "merchant.floor.cleared",
    payload: Record<string, unknown>,
  ): string {
    return this.events.append({
      tenant_id: command.tenantId,
      actor: "merchant_agent",
      kind,
      txn_id: null,
      request_id: command.requestId,
      mandate_id: null,
      payload,
    }).id;
  }
}
