import type { JSX } from "react";
import { Briefing } from "../panels/Briefing.tsx";
import { Demand } from "../panels/Demand.tsx";
import { Leakage } from "../panels/Leakage.tsx";
import { ListingAudit } from "../panels/ListingAudit.tsx";
import { Standing } from "../panels/Standing.tsx";
import { CooloffBoard } from "../orders/CooloffBoard.tsx";
import { OrdersTable } from "../orders/OrdersTable.tsx";
import { ListingEditor } from "../listings/ListingEditor.tsx";
import { ListingTable } from "../listings/ListingTable.tsx";
import { OptionSet } from "./OptionSet.tsx";
import type { ShopData } from "../data/useShopData.ts";
import type {
  Choice,
  ChoiceOption,
  Proposal,
  TurnPanel as PanelSpec,
} from "../assistant/turn.ts";
import type { DraftFields } from "../listings/itemDraft.ts";

type TurnPanelProps = {
  panel: PanelSpec;
  data: ShopData;
  canSign: boolean;
  busy: boolean;
  onSign: (proposal: Proposal, draft: DraftFields) => void;
  onPick: (choice: Choice, option: ChoiceOption) => void;
  onOpenListing: (itemId: string) => void;
};

/**
 * Structured data is a component in the thread, never a paragraph describing
 * one. Every panel here is the same component the page of the same name
 * renders, so the conversation and the pages cannot drift.
 */
export function TurnPanel({
  panel,
  data,
  canSign,
  busy,
  onSign,
  onPick,
  onOpenListing,
}: TurnPanelProps): JSX.Element | null {
  if (panel.kind === "choice") {
    const { choice } = panel;
    return (
      <OptionSet
        options={choice.options}
        onPick={(option) => onPick(choice, option)}
      />
    );
  }
  if (panel.kind === "editor") {
    const { proposal } = panel;
    return (
      <ListingEditor
        initial={proposal.draft}
        submitLabel={
          proposal.kind === "create" ? "Sign and list it" : "Sign the change"
        }
        busy={busy}
        showActive={proposal.kind === "edit"}
        canSign={canSign}
        onSubmit={(draft) => onSign(proposal, draft)}
      />
    );
  }
  if (panel.kind === "briefing") {
    return (
      <Briefing
        standing={data.standing}
        audit={data.audit.data}
        demand={data.demand.data}
        leakage={data.leakage.data}
      />
    );
  }
  if (panel.kind === "standing") {
    return data.standing === null ? null : (
      <Standing standing={data.standing} />
    );
  }
  if (panel.kind === "audit") {
    return data.audit.data === null ? null : (
      <ListingAudit audit={data.audit.data} />
    );
  }
  if (panel.kind === "listings") {
    return (
      <ListingTable
        items={data.shelf.data?.items ?? []}
        audited={data.audit.data?.listings ?? []}
        onOpen={onOpenListing}
      />
    );
  }
  if (panel.kind === "demand") {
    return data.demand.data === null ? null : (
      <Demand demand={data.demand.data} />
    );
  }
  if (panel.kind === "leakage") {
    return data.leakage.data === null ? null : (
      <Leakage leakage={data.leakage.data} />
    );
  }
  if (panel.kind === "cooloff") {
    return (
      <CooloffBoard orders={data.orders.data?.orders ?? []} now={new Date()} />
    );
  }
  return <OrdersTable orders={data.orders.data?.orders ?? []} />;
}
