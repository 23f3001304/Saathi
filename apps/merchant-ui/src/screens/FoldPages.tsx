import type { JSX } from "react";
import { Page } from "./Page.tsx";
import { Briefing } from "../panels/Briefing.tsx";
import { Demand } from "../panels/Demand.tsx";
import { Leakage } from "../panels/Leakage.tsx";
import { Standing } from "../panels/Standing.tsx";
import type { ShopData } from "../data/useShopData.ts";
import styles from "./FoldPages.module.css";

// The four read-only pages, kept together because they are the same shape: a
// page frame, one panel, one fold. Each is scoped to the signed-in shop.

type PageProps = { data: ShopData; shopSlug: string };

export function BriefingPage({ data }: PageProps): JSX.Element {
  return (
    <Page
      title="Why AI buyers pick you"
      lede="Ranked by what it costs you, and no number here was written by a model."
      live={data.desk.data?.live ?? false}
      source="from your own ledger"
    >
      <Briefing
        standing={data.standing}
        audit={data.audit.data}
        demand={data.demand.data}
        leakage={data.leakage.data}
      />
    </Page>
  );
}

export function StandingPage({ data, shopSlug }: PageProps): JSX.Element {
  return (
    <Page
      title="Standing"
      live={data.desk.data?.live ?? false}
      source={`how buyers rated ${shopSlug}`}
    >
      {data.standing === null ? (
        <p className={styles.empty}>Nothing read yet.</p>
      ) : (
        <Standing standing={data.standing} />
      )}
    </Page>
  );
}

export function DemandPage({ data, shopSlug }: PageProps): JSX.Element {
  return (
    <Page
      title="What you could not sell"
      lede="What buyers came looking for and did not find on your shelf."
      live={data.demand.data?.live ?? false}
      source={`searches buyers ran at ${shopSlug}`}
    >
      {data.demand.data !== null && <Demand demand={data.demand.data} />}
    </Page>
  );
}

export function LeakagePage({ data, shopSlug }: PageProps): JSX.Element {
  return (
    <Page
      title="Sales you lost"
      lede="Every one that was turned down, and why."
      live={data.leakage.data?.live ?? false}
      source={`sales turned down at ${shopSlug}`}
    >
      {data.leakage.data !== null && <Leakage leakage={data.leakage.data} />}
    </Page>
  );
}
