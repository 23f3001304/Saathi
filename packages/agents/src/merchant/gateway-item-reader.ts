import type {
  IdGenerator,
  MerchantItem,
  ShelfItem,
  ShelfReader,
} from "@covenant/domain";
import { DomainError, Money } from "@covenant/domain";

import { readHeaders } from "../buyer/acp-headers.js";

export interface GatewayItemReaderConfig {
  readonly baseUrl: string;
  readonly apiVersion: string;
  readonly timeoutMs: number;
}

interface WireItem {
  readonly item_id: string;
  readonly name: string;
  readonly description: string;
  readonly amount_paise: number;
  readonly currency: string;
  readonly active: boolean;
  /** The declared floor, or `null` for a listing with no discount authority. */
  readonly floor_paise: number | null;
}

/**
 * The agent's read of the merchant's live shelf — over the gateway, never over
 * Razorpay.
 *
 * DECISION: the agent process holds no Razorpay credentials, not even to list
 * items. Why: one Basic auth pair reaches every Razorpay endpoint, so an agent
 * given it to read inventory is an agent that can create a payment link. F2
 * says the single money egress is the gateway; the item read follows the same
 * line rather than opening a second door beside it.
 */
export class GatewayItemReader implements ShelfReader {
  constructor(
    private readonly fetchImpl: typeof fetch,
    private readonly ids: IdGenerator,
    private readonly config: GatewayItemReaderConfig,
  ) {}

  async listShelf(limit: number): Promise<readonly ShelfItem[]> {
    const response = await this.fetchImpl(
      `${this.config.baseUrl}/v1/merchant/items?limit=${Math.trunc(limit)}`,
      {
        headers: readHeaders(this.ids.uuid(), this.config.apiVersion),
        signal: AbortSignal.timeout(this.config.timeoutMs),
      },
    );
    if (!response.ok) {
      throw new DomainError("RAZORPAY_UNAVAILABLE");
    }
    const payload: unknown = await response.json();
    return itemsOf(payload).map((item) => ({
      item: toMerchantItem(item),
      floorPaise: item.floor_paise ?? null,
    }));
  }
}

const WIRE_TYPES: Readonly<Record<string, string>> = {
  item_id: "string",
  name: "string",
  description: "string",
  amount_paise: "number",
  currency: "string",
  active: "boolean",
};

/** A missing `floor_paise` is a shelf row with no declared discount authority. */
function floorOk(raw: Record<string, unknown>): boolean {
  const floor = raw["floor_paise"];
  return floor === null || floor === undefined || typeof floor === "number";
}

function isWireItem(value: unknown): value is WireItem {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const raw = value as Record<string, unknown>;
  return (
    Object.entries(WIRE_TYPES).every(
      ([field, kind]) => typeof raw[field] === kind,
    ) && floorOk(raw)
  );
}

function itemsOf(payload: unknown): readonly WireItem[] {
  if (typeof payload !== "object" || payload === null) {
    throw new DomainError("SCHEMA_VIOLATION");
  }
  const items = (payload as Record<string, unknown>)["items"];
  if (!Array.isArray(items) || !items.every((item) => isWireItem(item))) {
    throw new DomainError("SCHEMA_VIOLATION");
  }
  return items;
}

function toMerchantItem(item: WireItem): MerchantItem {
  try {
    return {
      itemId: item.item_id,
      name: item.name,
      description: item.description,
      price: Money.fromPaise(item.amount_paise, item.currency),
      active: item.active,
    };
  } catch {
    throw new DomainError("SCHEMA_VIOLATION");
  }
}
