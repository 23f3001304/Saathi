import { MoneyToolRegistry } from "../src/buyer/money-tool-registry.js";
import { PreToolUseHook } from "../src/buyer/pre-tool-use-hook.js";
import type { ToolCall } from "../src/shared/tool-envelope.js";
import { RecordingLogger, RecordingSink, RecordingTracer } from "./fakes.js";

export const GATEWAY = "covenant_gateway";
export const MERCHANT = "covenant_merchant";
export const WEB = "covenant_web";

export interface Row {
  readonly name: string;
  readonly tool: string;
  readonly server: string;
  readonly allowed: boolean;
  readonly money: boolean;
}

export const MATRIX: readonly Row[] = [
  {
    name: "verify-cart via gateway client",
    tool: "verify_cart",
    server: GATEWAY,
    allowed: true,
    money: true,
  },
  {
    name: "execute-payment via gateway client",
    tool: "execute_payment",
    server: GATEWAY,
    allowed: true,
    money: true,
  },
  {
    name: "cooloff cancel via gateway client",
    tool: "cooloff_cancel",
    server: GATEWAY,
    allowed: true,
    money: true,
  },
  {
    name: "execute-payment offered by the merchant",
    tool: "execute_payment",
    server: MERCHANT,
    allowed: false,
    money: true,
  },
  {
    name: "verify-cart as a built-in tool",
    tool: "verify_cart",
    server: "builtin",
    allowed: false,
    money: true,
  },
  {
    name: "unregistered tool on the gateway server",
    tool: "pay_direct",
    server: GATEWAY,
    allowed: false,
    money: true,
  },
  {
    name: "unregistered tool anywhere else",
    tool: "wire_transfer",
    server: MERCHANT,
    allowed: false,
    money: true,
  },
  {
    name: "catalog search",
    tool: "catalog_search",
    server: MERCHANT,
    allowed: true,
    money: false,
  },
  {
    name: "quote request",
    tool: "quote_request",
    server: MERCHANT,
    allowed: true,
    money: false,
  },
  {
    name: "memory retrieve",
    tool: "memory_retrieve",
    server: GATEWAY,
    allowed: true,
    money: false,
  },
  {
    name: "opening a shop in the sandbox window",
    tool: "web_open",
    server: WEB,
    allowed: true,
    money: false,
  },
  {
    name: "reading a cart total off a web page",
    tool: "web_cart",
    server: WEB,
    allowed: true,
    money: false,
  },
  {
    name: "clicking a control in the sandbox window",
    tool: "web_add_to_cart",
    server: WEB,
    allowed: true,
    money: false,
  },
  {
    name: "a payment tool dressed up as a browser tool",
    tool: "execute_payment",
    server: WEB,
    allowed: false,
    money: true,
  },
  {
    name: "an invented browser tool nobody registered",
    tool: "web_pay",
    server: WEB,
    allowed: false,
    money: true,
  },
];

export function buildHook(): {
  hook: PreToolUseHook;
  sink: RecordingSink;
  logger: RecordingLogger;
  tracer: RecordingTracer;
} {
  const sink = new RecordingSink();
  const logger = new RecordingLogger();
  const tracer = new RecordingTracer();
  const hook = new PreToolUseHook(
    new MoneyToolRegistry(),
    sink,
    logger,
    tracer,
    { tenantId: "tnt_demo", attackId: null },
  );
  return { hook, sink, logger, tracer };
}

export const callOf = (row: Row): ToolCall => ({
  tool: row.tool,
  server: row.server,
  args: { sku: "ASC-GC9-UK8" },
});
