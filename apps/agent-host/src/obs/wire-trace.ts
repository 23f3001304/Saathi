import type { Logger } from "@covenant/domain";

/**
 * What was actually sent to a model, and what actually came back.
 *
 * DECISION: a `fetch` wrapper rather than a hook inside each provider adapter.
 * Every non-Claude adapter reaches the network through the one injected
 * `fetch` in `agent-session-factory.ts`, so one wrapper sees all three — and
 * an adapter added tomorrow is traced without being told to be.
 *
 * DECISION: off unless `LOG_LEVEL=debug`. This prints the whole assembled
 * message list, which is the only artefact that can settle an argument about
 * where an instruction sat relative to the generation it was meant to govern —
 * and it is far too loud to leave on. The class of bug it was built for (a
 * rule the model never read, because it was buried behind a tool result) recurs
 * every time the prompt is rearranged, so it stays, behind the level switch.
 *
 * Headers are never logged: they carry the provider API key.
 */
const MAX_CHARS = 60_000;

const TRACING_LEVELS: readonly string[] = ["debug", "trace"];

export function tracesWire(logLevel: string): boolean {
  return TRACING_LEVELS.includes(logLevel);
}

function clip(value: unknown): string {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return (text ?? "").slice(0, MAX_CHARS);
}

type FetchTarget = Parameters<typeof fetch>[0];
type FetchInit = Parameters<typeof fetch>[1];

function urlOf(input: FetchTarget): string {
  if (typeof input === "string") return input;
  return input instanceof URL ? input.toString() : input.url;
}

interface WireBody {
  readonly model?: unknown;
  /** OpenAI Responses. */
  readonly input?: unknown;
  readonly instructions?: unknown;
  /** Chat Completions (Sarvam), where the system prompt is message zero. */
  readonly messages?: unknown;
  readonly tools?: unknown;
}

function bodyOf(init: FetchInit): WireBody | null {
  const raw = init?.body;
  if (typeof raw !== "string") return null;
  try {
    return JSON.parse(raw) as WireBody;
  } catch {
    return null;
  }
}

/** The tool surface names which session this is — the errand declares the five
 *  `web_*` tools and nothing else, the planner the six turn-plan ones. */
function toolNamesOf(body: WireBody): string {
  if (!Array.isArray(body.tools)) return "";
  return body.tools
    .map((tool) => {
      const record = tool as { name?: unknown; function?: { name?: unknown } };
      return String(record.name ?? record.function?.name ?? "?");
    })
    .join(",");
}

function logRequest(
  logger: Logger,
  input: FetchTarget,
  init: FetchInit,
): void {
  const body = bodyOf(init);
  if (body === null) return;
  logger.debug("model.wire.request", {
    url: urlOf(input),
    model: String(body.model ?? ""),
    tools: toolNamesOf(body),
    system: clip(body.instructions ?? ""),
    messages: clip(body.messages ?? body.input ?? []),
  });
}

/** A streamed answer is read by the adapter that asked for it; teeing it here
 *  to log the whole body would buffer the run's own stream behind this line. */
function streaming(response: Response): boolean {
  return (response.headers.get("content-type") ?? "").includes(
    "text/event-stream",
  );
}

async function logResponse(
  logger: Logger,
  input: FetchTarget,
  response: Response,
): Promise<void> {
  const fields = { url: urlOf(input), status: response.status };
  if (streaming(response)) {
    logger.debug("model.wire.response", { ...fields, body: "<stream>" });
    return;
  }
  const text = await response
    .clone()
    .text()
    .catch(() => "");
  logger.debug("model.wire.response", { ...fields, body: clip(text) });
}

export function tracingFetch(
  logger: Logger,
  base: typeof fetch = fetch,
): typeof fetch {
  return async (input, init) => {
    logRequest(logger, input, init);
    const response = await base(input, init);
    await logResponse(logger, input, response);
    return response;
  };
}

/** The `fetch` every routed session is built with: the traced one at debug,
 *  the platform's own otherwise, so the normal path pays nothing. */
export function wireFetch(logLevel: string, logger: Logger): typeof fetch {
  return tracesWire(logLevel) ? tracingFetch(logger) : fetch;
}
