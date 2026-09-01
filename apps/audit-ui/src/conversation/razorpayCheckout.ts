// Razorpay Standard Checkout, opened on an order. The shopper picks UPI, card
// or netbanking inside Razorpay's own frame; this app never sees an
// instrument, and the only Razorpay value it holds is the publishable key id.
const CHECKOUT_SRC = "https://checkout.razorpay.com/v1/checkout.js";

export interface CheckoutOptions {
  readonly keyId: string;
  readonly orderId: string;
  readonly amountPaise: number;
  readonly currency: string;
  readonly description: string;
  /**
   * Fired when Razorpay says the payment went through. It is a **hint to
   * re-ask the gateway sooner**, never the paid state itself: the browser is
   * not a witness the ledger accepts, and the same click on a tampered page
   * would "succeed" just as loudly.
   */
  readonly onSettled: () => void;
  readonly onDismissed: () => void;
}

interface RazorpayInstance {
  open: () => void;
}

type RazorpayConstructor = new (
  options: Record<string, unknown>,
) => RazorpayInstance;

function constructorOf(): RazorpayConstructor | null {
  const found = (globalThis as { Razorpay?: unknown }).Razorpay;
  return typeof found === "function" ? (found as RazorpayConstructor) : null;
}

let loading: Promise<RazorpayConstructor> | null = null;

/** One script tag per page, shared by every bill that asks for it. */
function loadCheckout(): Promise<RazorpayConstructor> {
  const ready = constructorOf();
  if (ready !== null) return Promise.resolve(ready);
  loading ??= new Promise<RazorpayConstructor>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = CHECKOUT_SRC;
    script.async = true;
    script.onload = () => {
      const loaded = constructorOf();
      if (loaded === null) {
        loading = null;
        reject(new Error("checkout.js loaded but exposed no Razorpay"));
        return;
      }
      resolve(loaded);
    };
    script.onerror = () => {
      // Cleared so a later attempt can retry rather than await a dead promise.
      loading = null;
      reject(new Error("checkout.js could not be loaded"));
    };
    document.head.appendChild(script);
  });
  return loading;
}

function optionsOf(options: CheckoutOptions): Record<string, unknown> {
  return {
    key: options.keyId,
    order_id: options.orderId,
    amount: options.amountPaise,
    currency: options.currency,
    name: "Saathi",
    description: options.description,
    // No `prefill`: this app holds no contact details for the shopper, and
    // inventing one to smooth the form would be a lie inside a trust product.
    handler: () => {
      options.onSettled();
    },
    modal: {
      ondismiss: () => {
        options.onDismissed();
      },
    },
  };
}

export async function openCheckout(options: CheckoutOptions): Promise<void> {
  const Checkout = await loadCheckout();
  new Checkout(optionsOf(options)).open();
}
