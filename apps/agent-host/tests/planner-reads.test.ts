// What the planner sees when it looks. Every field is a fact this host holds;
// the one thing it must never hold is the password the vault keeps for the
// sign-in routine, and that is asserted on the serialised state itself.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { DEMO_CATALOG } from "@covenant/agents";
import type { SessionState } from "@covenant/browser-drive";
import { afterAll, describe, expect, it } from "vitest";

import { WebFindings } from "../src/browser/web-listing.js";
import { WebProgress } from "../src/browser/web-progress.js";
import type { CovenantEdits } from "../src/covenant/amend-bounds.js";
import { ConfirmationGate } from "../src/purchase/confirmation-gate.js";
import { inertContext } from "../src/purchase/context-record.js";
import type { StateSources } from "../src/purchase/state-view.js";
import { HostStateView } from "../src/purchase/state-view.js";
import { TurnLanguage } from "../src/purchase/turn-language.js";
import { WebOffered } from "../src/purchase/web-offered.js";
import { WebPickPark } from "../src/purchase/web-pick-park.js";
import { CredentialVault } from "../src/session/credential-vault.js";

const dir = mkdtempSync(join(tmpdir(), "covenant-reads-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const PASSWORD = "hunter2-never-shown";

let minted = 0;

async function vaultWith(): Promise<CredentialVault> {
  minted += 1;
  const vault = new CredentialVault(join(dir, `vault-${minted}.json`));
  await vault.save({
    host: "www.amazon.in",
    username: "asha@example.com",
    password: PASSWORD,
  });
  return vault;
}

const EDITS: CovenantEdits = {
  bounds: [{ predicate: "max_amount", value: 250_000 }],
  envelopes: [{ category: "footwear", capPaise: 2_500_000 }],
  merchants: ["urn:covenant:merchant:kolam-run"],
  skus: [],
  blackout: null,
};

interface Rig {
  readonly view: HostStateView;
  readonly offered: WebOffered;
  readonly park: WebPickPark;
  readonly progress: WebProgress;
  readonly findings: WebFindings;
  readonly gates: { intent: ConfirmationGate; cart: ConfirmationGate };
  readonly language: TurnLanguage;
}

async function rigWith(window: SessionState | null): Promise<Rig> {
  const offered = new WebOffered();
  const park = new WebPickPark();
  const progress = new WebProgress();
  const findings = new WebFindings();
  const gates = {
    intent: new ConfirmationGate(false),
    cart: new ConfirmationGate(false),
  };
  const language = new TurnLanguage();
  const sources: StateSources = {
    shelf: { current: () => DEMO_CATALOG },
    merchantId: "kolam-run",
    offered,
    park,
    progress,
    findings,
    browser: {
      current: () =>
        window === null ? null : { currentState: () => window },
    },
    covenant: () => Promise.resolve(EDITS),
    gates,
    vault: await vaultWith(),
    context: inertContext(),
    language,
  };
  const view = new HostStateView(sources);
  return { view, offered, park, progress, findings, gates, language };
}

describe("seeing the shelf", () => {
  it("lists every listing as a row of host-read facts and nothing merchant-private", async () => {
    const { view } = await rigWith(null);
    const sight = await view.shelf();
    expect(sight.merchant).toBe("kolam-run");
    expect(sight.rows.map((row) => row.sku)).toEqual(
      DEMO_CATALOG.map((item) => item.sku),
    );
    expect(Object.keys(sight.rows[0] ?? {})).toEqual([
      "sku",
      "label",
      "category",
      "list_price_paise",
      "currency",
      "image_url",
    ]);
    const serialised = JSON.stringify(sight);
    expect(serialised).not.toContain("floorPricePaise");
    expect(serialised).not.toContain("stock");
    expect(serialised).not.toContain("Everyday road trainer");
  });
});

describe("seeing the state", () => {
  it("names the stored sign-ins by host and username, and never the password", async () => {
    const { view } = await rigWith(null);
    const state = await view.state();
    expect(state.sign_ins).toEqual([
      { host: "amazon.in", username: "asha@example.com" },
    ]);
    expect(JSON.stringify(state)).not.toContain(PASSWORD);
  });

  it("says who holds the window", async () => {
    expect((await (await rigWith("user-drive")).view.state()).checkout?.window).toBe("shopper");
    expect((await (await rigWith("agent-drive")).view.state()).checkout?.window).toBe("agent");
    expect((await (await rigWith(null)).view.state()).checkout).toBeNull();
  });

  it("reports a pending signature off the gate the runner waits on", async () => {
    const rig = await rigWith(null);
    const waiting = rig.gates.intent.wait();
    expect((await rig.view.state()).covenant.pending_signature).toBe("intent");
    rig.gates.intent.sign();
    await waiting;
    expect((await rig.view.state()).covenant.pending_signature).toBeNull();
  });

});

describe("seeing a checkout that stopped", () => {
  it("reports a parked checkout, the card it is about, and the basket", async () => {
    const rig = await rigWith("agent-drive");
    rig.offered.claim("cnv_1");
    const rows = rig.findings.record([
      {
        title: "Crucial X9 1TB Portable SSD",
        priceText: "₹6,199",
        href: "https://www.amazon.in/dp/B0CK778YL5",
        imageUrl: null,
      },
    ]);
    rig.offered.offer(rows);
    const ref = rows[0]?.ref ?? "";
    rig.park.hold(ref, "address");
    rig.progress.recordCarted();
    const state = await rig.view.state();
    expect(state.on_screen.options).toEqual([
      {
        ref,
        title: "Crucial X9 1TB Portable SSD",
        price_text: "₹6,199",
        url: "https://www.amazon.in/dp/B0CK778YL5",
        source: "web",
      },
    ]);
    expect(state.on_screen.picked).toEqual({
      ref,
      title: "Crucial X9 1TB Portable SSD",
      url: "https://www.amazon.in/dp/B0CK778YL5",
    });
    expect(state.checkout).toEqual({
      parked: "address",
      basket_holds: "Crucial X9 1TB Portable SSD",
      window: "agent",
      at_payment: false,
    });
  });

});

describe("seeing the standing covenant", () => {
  it("carries the covenant as the gateway reports it, and the turn's language", async () => {
    const rig = await rigWith(null);
    rig.language.set("hi");
    const state = await rig.view.state();
    expect(state.language_setting).toBe("hi");
    expect(state.covenant.bounds).toEqual([
      { predicate: "max_amount", value: 250_000 },
    ]);
    expect(state.covenant.envelopes).toEqual([
      { category: "footwear", cap_paise: 2_500_000 },
    ]);
    expect(state.covenant.merchants).toEqual([
      "urn:covenant:merchant:kolam-run",
    ]);
    expect(state.covenant.blackout).toBeNull();
    expect(state.earlier_dialogue_summary).toBeNull();
  });
});
