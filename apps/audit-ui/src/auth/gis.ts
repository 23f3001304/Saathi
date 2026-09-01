// Google Identity Services (GIS) — the current web contract, verified
// 2026-08-31 against the live docs:
//   https://developers.google.com/identity/gsi/web/guides/overview
//   https://developers.google.com/identity/gsi/web/guides/client-library
//   https://developers.google.com/identity/gsi/web/reference/js-reference
//
// Two things from those pages shape this file. First, the library is the
// single script at accounts.google.com/gsi/client exposing
// `google.accounts.id.*`; the older gapi/`auth2` Google Sign-In flow is
// deprecated and appears nowhere here. Second, the overview is explicit
// that new integrations should enable FedCM, so the button config below
// sets `use_fedcm_for_button` (the prompt path is FedCM by default now —
// `use_fedcm_for_prompt` is no longer in the IdConfiguration reference).
//
// The types are hand-written rather than pulled from @types/google.one-tap:
// this app takes no new dependency for four method signatures, and writing
// them out keeps the surface we actually rely on visible in review.

/** Passed to the `callback` in IdConfiguration. */
export type CredentialResponse = {
  /** The base64url JWT ID token. Display-only in this app. */
  credential: string;
  /** "auto" | "user" | "fedcm" | "btn" | ... — how the user was selected. */
  select_by?: string;
  state?: string;
};

export type IdConfiguration = {
  client_id: string;
  callback: (response: CredentialResponse) => void;
  auto_select?: boolean;
  cancel_on_tap_outside?: boolean;
  context?: "signin" | "signup" | "use";
  ux_mode?: "popup" | "redirect";
  use_fedcm_for_button?: boolean;
  itp_support?: boolean;
};

export type GsiButtonConfiguration = {
  type: "standard" | "icon";
  theme?: "outline" | "filled_blue" | "filled_black" | "outline_dark";
  size?: "large" | "medium" | "small";
  text?: "signin_with" | "signup_with" | "continue_with" | "signin";
  shape?: "rectangular" | "pill" | "circle" | "square";
  logo_alignment?: "left" | "center";
  width?: string;
  locale?: string;
};

export type GoogleAccountsId = {
  initialize(config: IdConfiguration): void;
  renderButton(parent: HTMLElement, options: GsiButtonConfiguration): void;
  prompt(): void;
  disableAutoSelect(): void;
  cancel(): void;
};

declare global {
  interface Window {
    google?: { accounts?: { id?: GoogleAccountsId } };
  }
}

const GIS_SRC = "https://accounts.google.com/gsi/client";

// DECISION: the script is injected on demand rather than hard-coded into
// index.html. A build with no client id (the demo path) must not reach out
// to accounts.google.com at all — no script, no cookie, no request.
let pending: Promise<GoogleAccountsId> | null = null;

function attachScript(
  resolve: (api: GoogleAccountsId) => void,
  reject: (error: Error) => void,
): void {
  const script = document.createElement("script");
  script.src = GIS_SRC;
  script.async = true;
  script.onload = () => {
    const api = window.google?.accounts?.id;
    if (api === undefined) reject(new Error("GIS loaded without accounts.id"));
    else resolve(api);
  };
  script.onerror = () => reject(new Error("Could not reach accounts.google.com"));
  document.head.appendChild(script);
}

/** Load `google.accounts.id` once; later callers share the same promise. */
export function loadGis(): Promise<GoogleAccountsId> {
  if (pending !== null) return pending;
  pending = new Promise<GoogleAccountsId>((resolve, reject) => {
    const existing = window.google?.accounts?.id;
    if (existing !== undefined) resolve(existing);
    else attachScript(resolve, reject);
  }).catch((error: unknown) => {
    // A failed load must not poison every later attempt — an offline moment
    // at first paint should not permanently disable sign-in.
    pending = null;
    throw error instanceof Error ? error : new Error("GIS failed to load");
  });
  return pending;
}

/** Test seam: forget any cached load. */
export function resetGisForTests(): void {
  pending = null;
}
