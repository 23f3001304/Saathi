import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { App } from "../src/App.tsx";
import { authReducer, SIGNED_OUT } from "../src/auth/authMachine.ts";
import { shopsOf } from "../src/auth/shops.ts";
import type { AuthProfile } from "../src/auth/types.ts";

const PROFILE: AuthProfile = {
  kind: "demo",
  subject: "demo-shopkeeper",
  name: "Demo shopkeeper",
  email: "demo@localhost",
  pictureUrl: null,
};

beforeEach(() => {
  window.localStorage.clear();
  window.history.pushState(null, "", "/");
});

describe("the doorstep", () => {
  it("opens on a sign-in screen, not on a dashboard", () => {
    render(<App />);

    expect(
      screen.getByRole("heading", { name: /Saathi for shops/i }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("navigation")).toBeNull();
  });

  it("says that signing in cannot change a listing", () => {
    render(<App />);

    expect(screen.getByText(/cannot say a shop is yours/i)).toBeInTheDocument();
  });

  it("offers a labelled demo identity when no Google client id is configured", () => {
    render(<App />);

    expect(
      screen.getByRole("button", { name: /Continue as a demo shopkeeper/i }),
    ).toBeInTheDocument();
  });

  it("asks which shop before opening any books", async () => {
    render(<App />);
    fireEvent.click(
      screen.getByRole("button", { name: /Continue as a demo shopkeeper/i }),
    );

    expect(
      await screen.findByRole("heading", { name: /Which shop\?/i }),
    ).toBeInTheDocument();
    expect(await screen.findByText("kolam-run")).toBeInTheDocument();
  });

  it("lands in the conversation once a shop is chosen, not a dashboard", async () => {
    render(<App />);
    fireEvent.click(
      screen.getByRole("button", { name: /Continue as a demo shopkeeper/i }),
    );
    fireEvent.click(await screen.findByText("kolam-run"));

    expect(
      await screen.findByRole("button", { name: /Why am I not being picked/i }),
    ).toBeInTheDocument();
    expect(window.location.pathname).toBe("/");
    await waitFor(() => {
      expect(screen.getAllByText("kolam-run").length).toBeGreaterThan(0);
    });
  });
});

describe("the auth machine", () => {
  it("never reaches ready on an identity alone", () => {
    const state = authReducer(SIGNED_OUT, {
      type: "identified",
      profile: PROFILE,
    });

    expect(state.status).toBe("signed-in");
    expect(state.shop).toBeNull();
  });

  it("drops a remembered shop that has left the pinned ring", () => {
    const chosen = authReducer(
      authReducer(SIGNED_OUT, { type: "identified", profile: PROFILE }),
      {
        type: "shop-chosen",
        shop: { slug: "gone", issuer: "urn:covenant:merchant:gone", kids: [] },
      },
    );

    const rechecked = authReducer(chosen, { type: "ring-loaded", ring: [] });

    expect(chosen.status).toBe("ready");
    expect(rechecked.status).toBe("signed-in");
    expect(rechecked.shop).toBeNull();
  });

  it("reads a shop's slug off the tail of its issuer URN", () => {
    expect(
      shopsOf([
        { issuer: "urn:covenant:merchant:nilgiri-weaves", kids: ["k"] },
      ]),
    ).toEqual([
      {
        slug: "nilgiri-weaves",
        issuer: "urn:covenant:merchant:nilgiri-weaves",
        kids: ["k"],
      },
    ]);
  });
});
