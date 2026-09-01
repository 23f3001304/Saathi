// First run as a person meets it: a doorstep, a key ceremony, then Chat —
// plus the two things that must never happen, namely the app opening on an
// identity alone, and a demo path dressed up as Google.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import {
  CLIENT_ID,
  Flow,
  GIS_SELECTOR,
  GOOGLE,
  mount,
  resetAuthEnvironment,
  seedStoredSession,
  stubBrowserGaps,
} from "./support/authHarness.tsx";
import { SignIn } from "../src/screens/SignIn.tsx";

// The ceremony's animations are Motion One's business, not auth's; jsdom has
// no WAAPI to run them against.
vi.mock("motion", () => ({ animate: () => undefined, stagger: () => 0 }));

const DEMO_BUTTON = { name: "Continue as a demo user" };

beforeAll(stubBrowserGaps);
beforeEach(resetAuthEnvironment);
afterEach(() => vi.unstubAllEnvs());

describe("with no client ID the app degrades to an explicit demo path", () => {
  it("offers a demo sign-in instead of a dead Google button", () => {
    mount(<SignIn />);
    expect(screen.getByRole("button", DEMO_BUTTON)).toBeDefined();
  });

  it("never contacts accounts.google.com when there is nothing to contact it with", () => {
    mount(<SignIn />);
    expect(document.querySelector(GIS_SELECTOR)).toBeNull();
  });

  it("says plainly that it is not Google and not anybody", () => {
    mount(<SignIn />);
    expect(screen.getByText(/not a Google account/)).toBeDefined();
    expect(screen.queryByText(/Sign in with Google/)).toBeNull();
  });
});

describe("the doorstep states what signing in cannot do", () => {
  it("puts the limit on the screen before anyone commits to anything", () => {
    mount(<SignIn />);
    expect(screen.getByText("What signing in cannot do")).toBeDefined();
    expect(screen.getByText(/it cannot spend a rupee/)).toBeDefined();
  });
});

describe("Google's script is fetched when it is needed, and not before", () => {
  it("loads GIS when a signed-out visitor is actually shown the button", async () => {
    vi.stubEnv("VITE_GOOGLE_CLIENT_ID", CLIENT_ID);
    mount(<SignIn />);
    await waitFor(() =>
      expect(document.querySelector(GIS_SELECTOR)).not.toBeNull(),
    );
  });

  it("leaves a returning, already-signed-in visitor unannounced to Google", async () => {
    vi.stubEnv("VITE_GOOGLE_CLIENT_ID", CLIENT_ID);
    seedStoredSession();
    mount(<Flow />);
    expect(await screen.findByText("Chat")).toBeDefined();
    expect(document.querySelector(GIS_SELECTOR)).toBeNull();
  });
});

describe("first run walks doorstep → key ceremony → Chat", () => {
  it("stops at the ceremony, and only the hold gets past it", async () => {
    mount(<Flow />);
    fireEvent.click(screen.getByRole("button", DEMO_BUTTON));

    expect(await screen.findByText("Now, the pen.")).toBeDefined();
    expect(screen.queryByText("Chat")).toBeNull();

    fireEvent.pointerDown(screen.getByRole("button", { name: "Hold to sign" }));
    expect(
      await screen.findByText(/That is your pen/, {}, { timeout: 3000 }),
    ).toBeDefined();
    expect(await screen.findByText("Chat", {}, { timeout: 3000 })).toBeDefined();
  });

  it("writes the session it just created, and reopens straight into Chat", async () => {
    const first = mount(<Flow />);
    fireEvent.click(screen.getByRole("button", DEMO_BUTTON));
    fireEvent.pointerDown(screen.getByRole("button", { name: "Hold to sign" }));
    await screen.findByText("Chat", {}, { timeout: 3000 });
    first.unmount();

    mount(<Flow />);
    expect(await screen.findByText("Chat")).toBeDefined();
  });

  it("restores a stored identity that has no key back into the ceremony", async () => {
    window.localStorage.setItem(
      "covenant-auth",
      JSON.stringify({ profile: GOOGLE, signingKey: null }),
    );
    mount(<Flow />);
    expect(await screen.findByText("Now, the pen.")).toBeDefined();
    expect(screen.queryByText("Chat")).toBeNull();
  });
});
