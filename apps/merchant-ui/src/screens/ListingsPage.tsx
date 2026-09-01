import { useState, type JSX } from "react";
import { Page } from "./Page.tsx";
import { ListingEditor } from "../listings/ListingEditor.tsx";
import { ListingTable } from "../listings/ListingTable.tsx";
import { ListingAudit } from "../panels/ListingAudit.tsx";
import { Negotiated } from "../panels/Negotiated.tsx";
import { useListingWrites } from "../listings/useListingWrites.ts";
import { draftOf } from "../listings/itemDraft.ts";
import type { ShopData } from "../data/useShopData.ts";
import styles from "./ListingsPage.module.css";

type ListingsPageProps = {
  data: ShopData;
  /** The listing whose editor is open, from the URL. */
  openItemId: string | null;
  canSign: boolean;
  onOpen: (itemId: string | null) => void;
};

const LEDE =
  "A price claim, and a link to the page where the product lives. We hold no stock.";

export function ListingsPage({
  data,
  openItemId,
  canSign,
  onOpen,
}: ListingsPageProps): JSX.Element {
  const [adding, setAdding] = useState(false);
  const items = data.shelf.data?.items ?? [];
  const live = data.shelf.data?.live ?? false;
  const writes = useListingWrites(() => {
    setAdding(false);
    onOpen(null);
    data.shelf.refetch();
    data.audit.refetch();
  });
  const open = items.find((item) => item.itemId === openItemId) ?? null;

  return (
    <Page
      title="Listings"
      lede={LEDE}
      live={live}
      source="from your live Razorpay listings"
      actions={
        <button
          type="button"
          className={styles.add}
          disabled={adding || !live}
          onClick={() => {
            setAdding(true);
            onOpen(null);
          }}
        >
          Add a listing
        </button>
      }
    >
      {writes.failure !== "" && (
        <p className={styles.failure}>{writes.failure}</p>
      )}
      {data.negotiated.data !== null && (
        <section className={styles.won}>
          <h2 className={styles.wonTitle}>What your floors won</h2>
          <Negotiated negotiated={data.negotiated.data} />
        </section>
      )}
      {adding && (
        <ListingEditor
          submitLabel="Sign and list it"
          busy={writes.busy}
          showActive={false}
          canSign={canSign}
          onSubmit={writes.create}
          onCancel={() => setAdding(false)}
        />
      )}
      {open !== null && (
        <section className={styles.editing}>
          <h2 className={styles.editingTitle}>{open.name}</h2>
          <ListingEditor
            initial={draftOf(open)}
            sku={open.itemId}
            submitLabel="Sign the change"
            busy={writes.busy}
            showActive
            canSign={canSign}
            onSubmit={(draft) =>
              writes.edit(open.itemId, draft, open.floorPaise)
            }
            onCancel={() => onOpen(null)}
          />
        </section>
      )}
      <ListingTable
        items={items}
        audited={data.audit.data?.listings ?? []}
        onOpen={(itemId) => {
          setAdding(false);
          onOpen(itemId);
        }}
      />
      {data.audit.data !== null && (
        <details className={styles.audit}>
          <summary className={styles.summary}>Every cue, in full</summary>
          <ListingAudit audit={data.audit.data} />
        </details>
      )}
      <p className={styles.note}>
        Retiring sets a listing inactive. Nothing is ever deleted.
      </p>
    </Page>
  );
}
