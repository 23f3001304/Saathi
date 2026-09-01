import "@testing-library/jest-dom/vitest";
import { webcrypto } from "node:crypto";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";
import { installGatewayStub } from "./tests/gatewayStub.ts";

// This project imports test globals explicitly rather than enabling
// `test.globals`, so RTL's auto-cleanup never fires; it is wired by hand.
afterEach(cleanup);

// jsdom implements no SubtleCrypto, and the merchant's key custody is built
// on it. The test environment gets the same primitive a browser provides.
if (!globalThis.crypto?.subtle) {
  Object.defineProperty(globalThis, "crypto", {
    value: webcrypto,
    configurable: true,
  });
}

// `.env.local` puts the suite in live mode, which is what we want — the wire
// mapping and the LIVE labelling are worth testing. What we do not want is a
// test that passes only while a gateway happens to be running on this laptop,
// so `fetch` is replaced with the routes' own shapes.
installGatewayStub();
