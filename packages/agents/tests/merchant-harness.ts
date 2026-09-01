import { FixtureCatalogSource } from "../src/merchant/catalog-source.js";
import { CatalogTool } from "../src/merchant/catalog-tool.js";
import {
  DEMO_CATALOG,
  DEMO_MERCHANT_ID,
  DEMO_MERCHANT_ISS,
} from "../src/merchant/demo-catalog.js";
import { MerchantAgent } from "../src/merchant/merchant-agent.js";
import { QuoteTool } from "../src/merchant/quote-tool.js";
import { AgentInstance } from "../src/shared/agent-instance.js";
import { ToolEnvelopeSigner } from "../src/shared/tool-envelope-signer.js";
import {
  envelopeVerifierConfig,
  ToolEnvelopeVerifier,
} from "../src/shared/tool-envelope-verifier.js";
import {
  FakeClock,
  HmacMandateSigner,
  HmacMandateVerifier,
  RecordingLogger,
  SeqIds,
} from "./fakes.js";

export const SERVER = "covenant_merchant";

export const START = "2026-08-31T09:14:02.113Z";

export const CATALOG_ARGS = {
  query: "kolam",
  max_price_paise: null,
  limit: 10,
};

export function harness(maxQuotesPerSku = 3): {
  agent: MerchantAgent;
  buyerSigner: ToolEnvelopeSigner;
  quoteTool: QuoteTool;
} {
  const clock = new FakeClock(START);
  const verifier = new ToolEnvelopeVerifier(
    new HmacMandateVerifier(),
    clock,
    envelopeVerifierConfig(SERVER, "user"),
  );
  const source = new FixtureCatalogSource(DEMO_CATALOG);
  const catalogTool = new CatalogTool(source, verifier, DEMO_MERCHANT_ID);
  const quoteTool = new QuoteTool(
    source,
    new HmacMandateSigner(),
    clock,
    new SeqIds(),
    {
      merchantIss: DEMO_MERCHANT_ISS,
      merchantId: DEMO_MERCHANT_ID,
      ttlSeconds: 600,
    },
  );
  const agent = new MerchantAgent(
    catalogTool,
    quoteTool,
    verifier,
    new RecordingLogger(),
    { server: SERVER, maxQuotesPerSku },
  );
  const buyerSigner = new ToolEnvelopeSigner(
    new HmacMandateSigner(),
    clock,
    new SeqIds(),
    new AgentInstance("buyer", "urn:covenant:user:9f3c", new SeqIds()),
    { keyRole: "user", ttlSeconds: 120 },
  );
  return { agent, buyerSigner, quoteTool };
}
