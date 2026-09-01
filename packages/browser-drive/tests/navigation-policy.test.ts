import { describe, expect, it } from "vitest";

import {
  NavigationPolicy,
  WEB_ONLY_NAVIGATION,
} from "../src/drive/navigation-policy.js";
import { FIXTURE_DIR, fixtureUrl } from "./fakes.js";

const webOnly = new NavigationPolicy(WEB_ONLY_NAVIGATION);
const fixtures = new NavigationPolicy({
  fileRoots: [FIXTURE_DIR],
  allowHosts: [],
  denyHosts: [],
});

describe("browser-internal schemes are refused", () => {
  it.each([
    "chrome://settings/passwords",
    "chrome://settings",
    "chrome-extension://abcdef/popup.html",
    "about:config",
    "about:blank",
    "devtools://devtools/bundled/inspector.html",
    "view-source:https://bazaar.example",
    "javascript:alert(1)",
    "data:text/html,<h1>hi</h1>",
    "blob:https://bazaar.example/1234",
    "ftp://files.example.com/x",
  ])("%s", (url) => {
    const decision = webOnly.check(url);
    expect(decision.allowed).toBe(false);
  });

  it("names the reason so the refusal can be narrated", () => {
    const decision = webOnly.check("chrome://settings/passwords");
    if (decision.allowed) {
      throw new Error("expected a refusal");
    }
    expect(decision.rule).toBe("scheme_not_allowed");
    expect(decision.human).toContain("web pages only");
  });
});

describe("file:// is refused outside the configured roots", () => {
  it("allows a fixture page", () => {
    expect(fixtures.check(fixtureUrl("index.html")).allowed).toBe(true);
  });

  it("refuses the user's disk", () => {
    const decision = fixtures.check("file:///C:/Users/dev/.ssh/id_rsa");
    expect(decision.allowed).toBe(false);
  });

  it("refuses a sibling directory of the fixture root", () => {
    expect(fixtures.check("file:///C:/Windows/win.ini").allowed).toBe(false);
  });

  it("refuses every file url when no root is configured", () => {
    expect(webOnly.check(fixtureUrl("index.html")).allowed).toBe(false);
  });

  it("does not let a traversal escape the root", () => {
    const escape = `${fixtureUrl("index.html").replace("index.html", "")}../../../secrets.txt`;
    expect(fixtures.check(escape).allowed).toBe(false);
  });
});

describe("host scoping", () => {
  it("allows any host when unscoped", () => {
    expect(webOnly.check("https://bazaar.example/cart").allowed).toBe(true);
  });

  it("honours a denylist", () => {
    const policy = new NavigationPolicy({
      fileRoots: [],
      allowHosts: [],
      denyHosts: ["evil.example"],
    });
    expect(policy.check("https://evil.example/x").allowed).toBe(false);
    expect(policy.check("https://sub.evil.example/x").allowed).toBe(false);
    expect(policy.check("https://bazaar.example/x").allowed).toBe(true);
  });

  it("scopes a session to one shop when an allowlist is given", () => {
    const policy = new NavigationPolicy({
      fileRoots: [],
      allowHosts: ["bazaar.example"],
      denyHosts: [],
    });
    expect(policy.check("https://bazaar.example/cart").allowed).toBe(true);
    expect(policy.check("https://shop.bazaar.example/cart").allowed).toBe(true);
    expect(policy.check("https://bazaar.example.evil.com/cart").allowed).toBe(false);
    expect(policy.check("https://other.example/cart").allowed).toBe(false);
  });

  it("refuses a string that is not a url at all", () => {
    expect(webOnly.check("not a url").allowed).toBe(false);
  });
});
