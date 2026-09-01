import type { GatewayClientConfig } from "../src/buyer/gateway-client.js";
import {
  DEFAULT_GATEWAY_CONFIG,
  GatewayClient,
} from "../src/buyer/gateway-client.js";
import { JwsRequestSigner } from "../src/buyer/jws-request-signer.js";
import type { CapturedRequest } from "./doubles.js";
import { capturingFetch } from "./doubles.js";
import { FakeClock, HmacMandateSigner, SeqIds } from "./fakes.js";

const CONFIG: GatewayClientConfig = {
  ...DEFAULT_GATEWAY_CONFIG,
  baseUrl: "https://gateway.test",
  tenantId: "tnt_demo",
};

export function build(responses: readonly Response[]): {
  client: GatewayClient;
  calls: CapturedRequest[];
} {
  const { fetch: fetchImpl, calls } = capturingFetch(responses);
  const client = new GatewayClient(
    fetchImpl,
    new JwsRequestSigner(new HmacMandateSigner(), "user"),
    new FakeClock("2026-08-31T09:14:02.113Z"),
    new SeqIds(),
    CONFIG,
  );
  return { client, calls };
}

/** A client whose `fetch` never connects, for the transport-failure case. */
export function unreachableClient(): GatewayClient {
  return new GatewayClient(
    (async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch,
    new JwsRequestSigner(new HmacMandateSigner(), "user"),
    new FakeClock("2026-08-31T09:14:02.113Z"),
    new SeqIds(),
    CONFIG,
  );
}
