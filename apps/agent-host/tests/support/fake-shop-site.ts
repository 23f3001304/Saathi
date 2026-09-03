// The little shop the fake sandbox stands in: four pages of the kind of markup
// a real store ships, so the real `FieldClassifier` has real text to judge.
import { button, descriptorOf, field, page } from "./fake-shop-build.js";
import type { ShopPage } from "./fake-shop-build.js";

export type { ShopPage } from "./fake-shop-build.js";

export const HOME = "https://shop.example/";
export const PRODUCT = "https://shop.example/product/red-runners";
export const CART = "https://shop.example/cart";
export const CHECKOUT = "https://shop.example/checkout";
export const LOGIN = "https://shop.example/account/login";
export const RESULTS = "https://shop.example/s?k=runners";
/** The same results, read again — every link rewritten with fresh tracking,
 *  which is what Amazon does to `ref=` and `qid` between two reads. */
export const RESULTS_AGAIN = "https://shop.example/s?k=runners&qid=2";
export const PRODUCT_BLUE = "https://shop.example/product/blue-runners";
export const PRODUCT_TRAIL = "https://shop.example/product/trail-runners";
/** A delivery form that is not under a checkout path, so the classifier judges
 *  its boxes on what they are rather than on where they sit. */
export const DELIVERY = "https://shop.example/delivery";
/** The shop asking to check you are human: its own words, and a vendor's
 *  widget in an iframe nothing in this system can read into. */
export const CHECKPOINT = "https://shop.example/checkpoint";
/** A review step: it offers a commit *and* a way forward, so it is not the end
 *  of the line — the agent may read it, and the commit is still refused. */
export const REVIEW = "https://shop.example/checkout/review";
/** The sign-in wall a real checkout puts between the basket and the address. */
export const SIGNIN = "https://shop.example/checkout/identify";

/** ₹2,499.00 on the cart page; ₹4,299.00 once delivery is added at checkout. */
export const CART_PAISE = 249_900;
export const CHECKOUT_PAISE = 429_900;

const ROW = {
  text: "Red Runners ₹2,499.00",
  priceText: "₹2,499.00",
  qtyText: "Qty: 1",
};

const PAGES: Readonly<Record<string, ShopPage>> = {
  [HOME]: page(HOME, {
    blocks: [{ tag: "h1", text: "Runners" }],
    links: [{ text: "Red Runners", href: PRODUCT }],
    controls: [field("#q", "Search", "search")],
    searchSelector: "#q",
  }),
  [PRODUCT]: page(PRODUCT, {
    blocks: [
      { tag: "h1", text: "Red Runners" },
      { tag: "p", text: "₹2,499.00" },
    ],
    links: [{ text: "Cart", href: CART }],
    controls: [button("#add", "Add to bag"), field("#size", "Size", "text")],
  }),
  [CART]: page(CART, {
    blocks: [{ tag: "p", text: "Order total ₹2,499.00" }],
    links: [{ text: "Proceed to checkout", href: CHECKOUT }],
    cart: {
      rows: [ROW],
      totalCandidates: ["Order total ₹2,499.00"],
      url: CART,
    },
  }),
  [CHECKOUT]: page(CHECKOUT, {
    blocks: [{ tag: "p", text: "Grand total ₹4,299.00" }],
    controls: [
      button("#place-order", "Place order"),
      field("#card-number", "Card number", "text"),
      // An ordinary delivery box, on a page whose URL says checkout. The
      // classifier refuses every text entry here, which is the whole point.
      field("#ship-city", "Town or city", "text"),
    ],
    cart: {
      rows: [ROW],
      totalCandidates: ["Grand total ₹4,299.00"],
      url: CHECKOUT,
    },
  }),
  [RESULTS]: page(RESULTS, {
    blocks: [{ tag: "h1", text: "Results for runners" }],
    // The four cases the option beat has to tell apart: a full tile, a tile
    // with no picture, a tile whose picture is served over http, and a tile
    // whose price the reader could not parse into this covenant's currency.
    listings: [
      {
        title: "Red Runners",
        priceText: "₹2,499.00",
        href: PRODUCT,
        imageUrl: "https://img.shop.example/red.jpg",
      },
      {
        title: "Blue Runners",
        priceText: "₹3,150.00",
        href: PRODUCT_BLUE,
        imageUrl: null,
      },
      {
        title: "Trail Runners",
        priceText: "₹1,899.00",
        href: PRODUCT_TRAIL,
        imageUrl: "http://img.shop.example/trail.jpg",
      },
      {
        title: "Runners Sock Pack",
        priceText: "20% off",
        href: "https://shop.example/product/socks",
        imageUrl: null,
      },
    ],
    controls: [field("#q", "Search", "search")],
    searchSelector: "#q",
  }),
  [RESULTS_AGAIN]: page(RESULTS_AGAIN, {
    listings: [
      {
        title: "Red Runners",
        priceText: "₹2,499.00",
        href: `${PRODUCT}?ref=sr_1_9&qid=2`,
        imageUrl: "https://img.shop.example/red.jpg",
      },
    ],
  }),
  [SIGNIN]: page(SIGNIN, {
    blocks: [{ tag: "h1", text: "Sign in to continue" }],
    controls: [
      field("#email", "Email", "text"),
      field("#password", "Password", "password"),
      button("#submit", "Continue"),
    ],
  }),
  [REVIEW]: page(REVIEW, {
    blocks: [{ tag: "p", text: "Order total ₹2,499.00" }],
    controls: [
      button("#place-order", "Place order"),
      button("#continue", "Continue"),
    ],
  }),
  [CHECKPOINT]: page(CHECKPOINT, {
    blocks: [
      { tag: "h1", text: "Checking your browser" },
      { tag: "p", text: "Please confirm you are a human to continue." },
    ],
    frames: [
      "https://challenges.cloudflare.com/cdn-cgi/challenge-platform/x/y",
    ],
    // The checkbox a real challenge puts in front of you, in its own words.
    // It is what makes this page refusable by the classifier rather than
    // merely empty of anything to press.
    controls: [button("#verify", "I am not a robot")],
  }),
  [DELIVERY]: page(DELIVERY, {
    blocks: [{ tag: "h1", text: "Where should this go?" }],
    controls: [
      field("#full-name", "Full name", "text"),
      field("#address-line-1", "Address line 1", "text"),
      field("#city", "Town or city", "text"),
      field("#pincode", "PIN code", "text"),
      field("#card-number", "Card number", "text"),
      button("#deliver-here", "Deliver to this address"),
    ],
  }),
  [LOGIN]: page(LOGIN, {
    blocks: [{ tag: "h1", text: "Sign in" }],
    // A shop's header search box, on the sign-in page. The classifier refuses
    // every text entry inside a sign-in scope, and this is that rule firing.
    controls: [field("#q", "Search", "search")],
    searchSelector: "#q",
  }),
};

export function pageAt(url: string): ShopPage {
  return PAGES[url] ?? page(url, {});
}

export { descriptorOf };
