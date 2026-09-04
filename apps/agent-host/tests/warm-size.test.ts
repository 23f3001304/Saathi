import { describe, expect, it } from "vitest";

import {
  DEFAULT_WARM_READERS,
  DEFAULT_WARM_WINDOWS,
  MAX_WARM,
  warmReserved,
  warmSizesFrom,
} from "../src/browser/warm-size.js";

describe("how many sandboxes are kept warm", () => {
  it("keeps one of each when nobody has said otherwise", () => {
    expect(warmSizesFrom({})).toEqual({
      readers: DEFAULT_WARM_READERS,
      windows: DEFAULT_WARM_WINDOWS,
    });
  });

  /** `Number("")` is 0, so an unset variable read as a number is a request for
   *  no warm pool at all. A host with no env file must still get the default. */
  it("treats an empty variable as unset rather than as zero", () => {
    expect(warmSizesFrom({ COVENANT_WARM_READERS: "" }).readers).toBe(
      DEFAULT_WARM_READERS,
    );
    expect(warmSizesFrom({ COVENANT_WARM_READERS: "  " }).readers).toBe(
      DEFAULT_WARM_READERS,
    );
  });

  it("lets a host ask for none, which is a real answer", () => {
    expect(warmSizesFrom({ COVENANT_WARM_WINDOWS: "0" }).windows).toBe(0);
  });

});

describe("a host that asks for a particular number", () => {
  it("gets it, up to the ceiling", () => {
    expect(warmSizesFrom({ COVENANT_WARM_READERS: "3" }).readers).toBe(3);
    expect(warmSizesFrom({ COVENANT_WARM_READERS: "99" }).readers).toBe(
      MAX_WARM,
    );
  });

  it("falls back rather than trusting nonsense", () => {
    expect(warmSizesFrom({ COVENANT_WARM_WINDOWS: "many" }).windows).toBe(
      DEFAULT_WARM_WINDOWS,
    );
    expect(warmSizesFrom({ COVENANT_WARM_WINDOWS: "-2" }).windows).toBe(
      DEFAULT_WARM_WINDOWS,
    );
  });

  it("reserves every warm container out of the window budget", () => {
    expect(warmReserved({ readers: 2, windows: 1 })).toBe(3);
  });
});
