import type { JSX } from "react";
import { Page } from "./Page.tsx";
import { CooloffBoard } from "../orders/CooloffBoard.tsx";
import { OrdersTable } from "../orders/OrdersTable.tsx";
import { capturedPaise, committedPaise } from "../orders/orderState.ts";
import { paise } from "../primitives/formatMoney.ts";
import type { ShopData } from "../data/useShopData.ts";
import styles from "./OrdersPage.module.css";

const LEDE = "Payment records only — nothing here is a parcel.";

type OrdersPageProps = { data: ShopData };

export function OrdersPage({ data }: OrdersPageProps): JSX.Element {
  const orders = data.orders.data?.orders ?? [];
  const live = data.orders.data?.live ?? false;
  const awaiting = orders.filter((order) => order.state === "link_issued");
  const now = new Date();

  return (
    <Page title="Orders" lede={LEDE} live={live} source="from your own ledger">
      <dl className={styles.figures}>
        <div className={styles.figure}>
          <dt>Captured</dt>
          <dd className="tabular-nums">{paise(capturedPaise(orders))}</dd>
          <dd className={styles.detail}>Razorpay took it</dd>
        </div>
        <div className={styles.figure}>
          <dt>In cool-off</dt>
          <dd className="tabular-nums">{paise(committedPaise(orders))}</dd>
          <dd className={styles.detail}>not yours yet</dd>
        </div>
        <div className={styles.figure}>
          <dt>Awaiting payment</dt>
          <dd className="tabular-nums">{awaiting.length.toString()}</dd>
          <dd className={styles.detail}>
            {awaiting.length === 1 ? "link issued" : "links issued"}
          </dd>
        </div>
      </dl>

      <section className={styles.section}>
        <h2 className={styles.heading}>Waiting out a cool-off</h2>
        <CooloffBoard orders={orders} now={now} />
      </section>

      <section className={styles.section}>
        <h2 className={styles.heading}>Every record</h2>
        <OrdersTable orders={orders} />
      </section>
    </Page>
  );
}
