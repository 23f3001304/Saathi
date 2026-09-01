import { fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { enterDesk } from "./enterDesk.tsx";
import { STUB_ITEM_ID } from "./gatewayStub.ts";
import {
  hostOf,
  joinCopy,
  safeImageUrl,
  safeProductUrl,
  splitCopy,
} from "../src/listings/productUrl.ts";
import {
  draftOf,
  draftProblem,
  emptyDraft,
} from "../src/listings/itemDraft.ts";
import { holdKeyFile, releaseKey } from "../src/api/merchantKey.ts";
import { updateItem } from "../src/api/merchantWrites.ts";

describe("a listing is a claim and a pointer", () => {
  it("reads the product page off its own labelled line", () => {
    const split = splitCopy(
      "Handloom cotton in indigo.\n\nProduct page: https://kolam-run.example/kurta",
    );

    expect(split.copy).toBe("Handloom cotton in indigo.");
    expect(split.productUrl).toBe("https://kolam-run.example/kurta");
  });

  it("round-trips the copy and the pointer without merging them", () => {
    const joined = joinCopy(
      "Indigo, full sleeve.",
      "https://shop.example/x",
      "",
    );

    expect(splitCopy(joined).copy).toBe("Indigo, full sleeve.");
    expect(splitCopy(joined).productUrl).toBe("https://shop.example/x");
  });

  it("reads a listing with no pointer as having none rather than guessing", () => {
    expect(splitCopy("Just a description.").productUrl).toBeNull();
  });

  it("refuses a scheme that is not http or https", () => {
    expect(safeProductUrl("javascript:alert(1)")).toBeNull();
    expect(safeProductUrl("data:text/html,<b>x</b>")).toBeNull();
    expect(safeProductUrl("https://shop.example/x")).toBe(
      "https://shop.example/x",
    );
  });

  it("shows a pointer by host, not by its whole query string", () => {
    expect(hostOf("https://shop.example/x?utm_source=y")).toBe("shop.example");
  });

  it("splits the pointer out of the description when an editor opens", () => {
    const draft = draftOf({
      itemId: "item_x",
      name: "Stole",
      description: "Soft.\n\nProduct page: https://shop.example/stole",
      amountPaise: 189900,
      currency: "INR",
      active: true,
    });

    expect(draft.description).toBe("Soft.");
    expect(draft.productUrl).toBe("https://shop.example/stole");
    expect(draft.rupees).toBe("1899.00");
  });
});

describe("a listing may also carry a picture, which is a claim too", () => {
  it("round-trips both pointers on their own labelled lines", () => {
    const joined = joinCopy(
      "Indigo, full sleeve.",
      "https://shop.example/x",
      "https://shop.example/x.jpg",
    );
    const split = splitCopy(joined);

    expect(split.copy).toBe("Indigo, full sleeve.");
    expect(split.productUrl).toBe("https://shop.example/x");
    expect(split.imageUrl).toBe("https://shop.example/x.jpg");
  });

  it("keeps neither line inside the copy the detector audits", () => {
    const joined = joinCopy(
      "Soft.",
      "https://shop.example/x",
      "https://shop.example/x.jpg",
    );

    expect(splitCopy(joined).copy).not.toContain("https://");
  });

  it("carries an image with no product page, and the reverse", () => {
    const imageOnly = splitCopy(
      joinCopy("Soft.", "", "https://s.example/a.png"),
    );
    const pageOnly = splitCopy(joinCopy("Soft.", "https://s.example/a", ""));

    expect(imageOnly.imageUrl).toBe("https://s.example/a.png");
    expect(imageOnly.productUrl).toBeNull();
    expect(pageOnly.imageUrl).toBeNull();
    expect(pageOnly.productUrl).toBe("https://s.example/a");
  });

  it("reads a listing with no image as having none rather than inventing one", () => {
    expect(splitCopy("Just a description.").imageUrl).toBeNull();
  });

  it("takes https only — an image is fetched by a buyer's browser unasked", () => {
    expect(safeImageUrl("https://s.example/a.jpg")).toBe(
      "https://s.example/a.jpg",
    );
    expect(safeImageUrl("http://s.example/a.jpg")).toBeNull();
    expect(safeImageUrl("data:image/svg+xml,<svg onload=alert(1)>")).toBeNull();
    expect(safeImageUrl("javascript:alert(1)")).toBeNull();
    expect(safeImageUrl("  ")).toBeNull();
  });

  it("never writes a scheme it would refuse to read back", () => {
    const joined = joinCopy("Soft.", "", "javascript:alert(1)");

    expect(joined).toBe("Soft.");
    expect(splitCopy(joined).imageUrl).toBeNull();
  });

  it("says so plainly rather than saving a link that will never load", () => {
    const draft = {
      ...emptyDraft(),
      name: "Stole",
      rupees: "1899",
      floorRupees: "",
      imageUrl: "http://shop.example/a.jpg",
    };

    expect(draftProblem(draft)).toMatch(/full https address/i);
    expect(draftProblem({ ...draft, imageUrl: "" })).toBe("");
  });

  it("splits the image out of the description when an editor opens", () => {
    const draft = draftOf({
      itemId: "item_x",
      name: "Stole",
      description:
        "Soft.\n\nProduct page: https://shop.example/stole\nProduct image: https://shop.example/stole.jpg",
      amountPaise: 189900,
      currency: "INR",
      active: true,
    });

    expect(draft.description).toBe("Soft.");
    expect(draft.imageUrl).toBe("https://shop.example/stole.jpg");
  });
});

describe("the listings page", () => {
  it("is its own route, reachable without scrolling past the briefing", async () => {
    await enterDesk("Listings");

    expect(window.location.pathname).toBe("/listings");
    expect(
      await screen.findByRole("heading", { name: "Listings" }),
    ).toBeInTheDocument();
  });

  it("says a shop's copy is read by the detector the buyer runs", async () => {
    await enterDesk("Listings");

    expect(
      (await screen.findAllByText(/Nilgiri handloom stole/)).length,
    ).toBeGreaterThan(0);
    await waitFor(() => {
      expect(screen.getAllByText("Scarcity").length).toBeGreaterThan(0);
    });
  });

  it("opens one listing at its own URL, with the audit beside the copy", async () => {
    await enterDesk("Listings");
    fireEvent.click(
      (await screen.findAllByRole("button", { name: "Open" }))[0]!,
    );

    expect(window.location.pathname).toBe(`/listings/${STUB_ITEM_ID}`);
    expect(
      await screen.findByRole("heading", {
        name: /As a buyer agent reads it/i,
      }),
    ).toBeInTheDocument();
  });

  it("shows a merchant's own picture, and the weave where there is none", async () => {
    await enterDesk("Listings");
    await screen.findAllByText(/Nilgiri handloom stole/);
    const rows = (await screen.findByRole("table")).querySelectorAll(
      "tbody tr",
    );
    const withImage = rows[0]?.querySelector("img");

    expect(withImage?.getAttribute("src")).toBe(
      "https://kolam-run.example/nilgiri-stole.jpg",
    );
    expect(withImage?.getAttribute("referrerpolicy")).toBe("no-referrer");
    expect(withImage?.getAttribute("loading")).toBe("lazy");
    expect(rows[1]?.querySelector("img")).toBeNull();
    expect(rows[1]?.querySelector("svg")).not.toBeNull();
  });

  it("degrades a dead picture to the weave, never to a broken-image icon", async () => {
    await enterDesk("Listings");
    await screen.findAllByText(/Nilgiri handloom stole/);
    const row = (await screen.findByRole("table")).querySelectorAll(
      "tbody tr",
    )[0];
    fireEvent.error(row!.querySelector("img")!);

    await waitFor(() => {
      expect(row?.querySelector("img")).toBeNull();
    });
    expect(row?.querySelector("svg")).not.toBeNull();
  });

  it("has an image field beside the product page field", async () => {
    await enterDesk("Listings");
    fireEvent.click(
      (await screen.findAllByRole("button", { name: "Open" }))[0]!,
    );

    expect(await screen.findByText("Product image")).toBeInTheDocument();
    expect(
      screen.getByDisplayValue("https://kolam-run.example/nilgiri-stole.jpg"),
    ).toBeInTheDocument();
  });

  it("has a product page field and no field for stock, pickup or dispatch", async () => {
    await enterDesk("Listings");
    fireEvent.click(
      (await screen.findAllByRole("button", { name: "Open" }))[0]!,
    );
    await screen.findAllByText("Product page");
    const html = document.body.innerHTML.toLowerCase();

    expect(html).not.toContain("dispatch");
    expect(html).not.toContain("in stock");
    expect(html).not.toContain("pickup");
    expect(html).not.toContain("courier");
  });

  it("cannot be saved from a device that holds no signing key", async () => {
    await enterDesk("Listings");
    fireEvent.click(
      (await screen.findAllByRole("button", { name: "Open" }))[0]!,
    );

    expect(
      await screen.findByRole("button", { name: /Sign the change/i }),
    ).toBeDisabled();
    expect(
      screen.getByText(/No signing key on this device/i),
    ).toBeInTheDocument();
  });
});

const KID = "merchant-2026-08-479bb8bf";

const ITEM = {
  item_id: "item_x",
  name: "Stole",
  description: "Soft.",
  amount_paise: 189900,
  currency: "INR",
  active: true,
};

async function keyFile(): Promise<File> {
  const pair = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  );
  const jwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
  return new File(
    [JSON.stringify({ ...jwk, kid: KID, alg: "ES256" })],
    `${KID}.private.jwk.json`,
    { type: "application/json" },
  );
}

describe("changing a picture is an inventory write", () => {
  it("goes out over the same signed body a price change does", async () => {
    await holdKeyFile(await keyFile(), "kolam-run", [KID], false);
    const sent: { signature: string | null; body: string }[] = [];
    const stub = globalThis.fetch;
    globalThis.fetch = ((_input: RequestInfo | URL, init?: RequestInit) => {
      sent.push({
        signature: new Headers(init?.headers).get("Signature"),
        body: String(init?.body ?? ""),
      });
      return Promise.resolve(
        new Response(JSON.stringify({ item: ITEM }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );
    }) as typeof fetch;

    try {
      await updateItem("item_x", {
        name: "Stole",
        description: joinCopy("Soft.", "", "https://shop.example/stole.jpg"),
        amountPaise: 189900,
        currency: "INR",
        active: true,
      });
    } finally {
      globalThis.fetch = stub;
      releaseKey();
    }

    expect(sent).toHaveLength(1);
    expect(sent[0]?.signature).toContain(KID);
    expect(sent[0]?.body).toContain(
      "Product image: https://shop.example/stole.jpg",
    );
  });
});

describe("the JWK textarea", () => {
  it("is gone from the console entirely", async () => {
    await enterDesk("Listings");

    expect(screen.queryByPlaceholderText(/private jwk/i)).toBeNull();
    expect(document.querySelectorAll("textarea").length).toBeLessThan(2);
  });
});
