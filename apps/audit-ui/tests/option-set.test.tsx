import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { OptionSet } from "../src/conversation/OptionSet.tsx";
import type { OptionRowData } from "../src/conversation/chatScript.ts";

const OPTIONS: OptionRowData[] = [
  {
    id: "A",
    sku: "sku-a",
    title: "Option A",
    pricePaise: 129_900,
    rating: 4.2,
    deliveryDays: 2,
    merchant: "m1",
  },
  {
    id: "B",
    sku: "sku-b",
    title: "Option B",
    pricePaise: 134_900,
    rating: 4.4,
    deliveryDays: 1,
    merchant: "m2",
  },
  {
    id: "C",
    sku: "sku-c",
    title: "Option C",
    pricePaise: 141_000,
    rating: 4.1,
    deliveryDays: 3,
    merchant: "m3",
  },
];

describe("OptionSet", () => {
  it("§4.5 invariant — renders no recommended/sponsored/badge/highlighted markup", () => {
    render(<OptionSet options={OPTIONS} onAsk={() => undefined} />);
    const html = document.body.innerHTML.toLowerCase();
    expect(html).not.toContain("recommended");
    expect(html).not.toContain("sponsored");
    expect(html).not.toContain("badge");
    expect(html).not.toContain("highlighted");
  });

  it("row order is the only encoding of rank — matches input order exactly", () => {
    render(<OptionSet options={OPTIONS} onAsk={() => undefined} />);
    const rows = screen.getAllByRole("button");
    expect(rows.map((row) => row.textContent?.[0])).toEqual(["A", "B", "C"]);
  });

  it("clicking a row asks about that option's id", () => {
    const onAsk = vi.fn();
    render(<OptionSet options={OPTIONS} onAsk={onAsk} />);
    screen.getAllByRole("button")[1]?.click();
    expect(onAsk).toHaveBeenCalledWith("B");
  });
});

function withImage(imageUrl: string): OptionRowData[] {
  return [{ ...OPTIONS[0]!, imageUrl }];
}

describe("a merchant's picture on the card", () => {
  it("shows the merchant's own image where they gave one", () => {
    render(
      <OptionSet
        options={withImage("https://shop.example/a.jpg")}
        onAsk={() => undefined}
      />,
    );
    const image = document.querySelector("img");

    expect(image?.getAttribute("src")).toBe("https://shop.example/a.jpg");
    expect(image?.getAttribute("alt")).toBe("");
  });

  it("tells the merchant's host as little as an image fetch can", () => {
    render(
      <OptionSet
        options={withImage("https://shop.example/a.jpg")}
        onAsk={() => undefined}
      />,
    );
    const image = document.querySelector("img");

    expect(image?.getAttribute("referrerpolicy")).toBe("no-referrer");
    expect(image?.getAttribute("loading")).toBe("lazy");
  });

  it("falls back to the woven plate when the merchant gave no image", () => {
    render(<OptionSet options={OPTIONS} onAsk={() => undefined} />);

    expect(document.querySelector("img")).toBeNull();
    const plated = screen
      .getAllByRole("button")
      .filter((card) => card.querySelector("svg") !== null);
    expect(plated).toHaveLength(OPTIONS.length);
  });

  it("renders no img at all for a scheme it will not fetch", () => {
    for (const hostile of [
      "javascript:alert(1)",
      "data:image/svg+xml,<svg onload=alert(1)>",
      "http://shop.example/a.jpg",
      "not a url",
    ]) {
      const view = render(
        <OptionSet options={withImage(hostile)} onAsk={() => undefined} />,
      );
      expect(document.querySelector("img")).toBeNull();
      expect(document.querySelector("svg")).not.toBeNull();
      view.unmount();
    }
  });

  it("degrades a dead link to the plate, not to a broken-image icon", () => {
    render(
      <OptionSet
        options={withImage("https://shop.example/gone.jpg")}
        onAsk={() => undefined}
      />,
    );
    fireEvent.error(document.querySelector("img")!);

    expect(document.querySelector("img")).toBeNull();
    expect(document.querySelector("svg")).not.toBeNull();
  });

  it("never puts merchant text into the picture's place in the a11y tree", () => {
    render(
      <OptionSet
        options={[
          {
            ...OPTIONS[0]!,
            imageUrl: "https://shop.example/a.jpg",
            title: "Option A",
          },
        ]}
        onAsk={() => undefined}
      />,
    );

    expect(screen.queryByRole("img")).toBeNull();
  });
});

/**
 * The one line on the card no plain product grid can print. `quoteSigned` is
 * the tier for both paths; `sourceUrl` says where an unsigned number came from,
 * so a row read off a live listing makes the stronger, truer claim.
 */
describe("the evidence line", () => {
  function lineFor(over: Partial<OptionRowData>): string {
    const view = render(
      <OptionSet
        options={[{ ...OPTIONS[0]!, ...over }]}
        onAsk={() => undefined}
      />,
    );
    const text = screen.getAllByRole("button")[0]?.textContent ?? "";
    view.unmount();
    return text;
  }

  it("says signed quote where a merchant signed one", () => {
    expect(lineFor({ quoteSigned: true })).toContain("signed quote");
  });

  it("says page price, unsigned for a row the agent read off the web", () => {
    const text = lineFor({
      quoteSigned: false,
      sourceUrl: "https://www.amazon.in/dp/B08W369FLH",
    });
    expect(text).toContain("page price, unsigned");
    expect(text).not.toContain("signed quote");
  });

  it("still says no signed quote for a catalog row that has neither", () => {
    expect(lineFor({})).toContain("no signed quote");
  });
});
