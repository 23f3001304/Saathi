import { useCallback, useEffect, useRef, useState } from "react";
import type {
  BrowserBlackout,
  BrowserSample,
  BrowserSessionView,
} from "./browserSession.ts";
import type {
  BrowserFrame,
  BrowserStatus,
  BrowserTransport,
  RelayInput,
  RelayRefusal,
} from "./browserTransport.ts";
import {
  SAMPLE_HOST_GONE,
  SAMPLE_NO_HOST,
  SANDBOX_REFUSED,
} from "./browserTransport.ts";
import { attach } from "./browserFallback.ts";
import { fixtureBrowser } from "./fixtureBrowser.ts";
import { liveBrowser } from "./liveBrowser.ts";
import { agentBaseUrl } from "../api/liveMode.ts";

export type BrowserSession = {
  readonly view: BrowserSessionView | null;
  readonly status: BrowserStatus;
  /** Non-null when the last relayed action was refused, with its sentence. */
  readonly refusal: RelayRefusal | null;
  readonly resume: () => void;
  readonly takeover: () => void;
  readonly relay: (input: RelayInput) => void;
  readonly front: () => void;
  readonly dismissRefusal: () => void;
};

function transportFor(): BrowserTransport {
  const base = agentBaseUrl();
  return base === null ? fixtureBrowser() : liveBrowser(base);
}

/**
 * A refused sandbox is a card, not a blank space. The panel says the host
 * turned the request down and why — the failure mode the brief asked for is
 * "it says it was refused", and an empty pane says "it is broken".
 */
const REFUSED_VIEW: BrowserSessionView = {
  merchant: "sandbox",
  url: "",
  title: "",
  state: "closed",
  actions: [],
  notice: SANDBOX_REFUSED,
};

/**
 * The two statuses under which this card is showing a script. `live` and
 * `connecting` are absent on purpose: a card with nothing to declare declares
 * nothing, which is what makes the declaration mean something when it appears.
 */
const SAMPLE: Partial<Record<BrowserStatus, BrowserSample>> = {
  fixtures: { label: "demo", human: SAMPLE_NO_HOST },
  offline: { label: "offline", human: SAMPLE_HOST_GONE },
};

function labelled(
  view: BrowserSessionView | null,
  status: BrowserStatus,
): BrowserSessionView | null {
  const sample = SAMPLE[status];
  if (view === null || sample === undefined) return view;
  return { ...view, sample };
}

function withFrame(
  view: BrowserSessionView | null,
  frame: BrowserFrame | null,
  blackout: BrowserBlackout | null,
): BrowserSessionView | null {
  if (view === null) return null;
  if (blackout !== null) return { ...view, blackout };
  if (frame === null) return view;
  return {
    ...view,
    frame: frame.image,
    frameWidth: frame.width,
    frameHeight: frame.height,
    redacted: frame.redacted,
  };
}

/**
 * Plays the open-web beat, live where a host is configured and from the reel
 * where it is not — and falls back to the reel mid-flight if the host goes
 * away, the same honest degradation the conversation uses
 * (resilientTransport.ts). `resume()` is still the only way out of
 * `user-drive`: readiness is suggested by the harness, never acted on.
 */
/** Everything arriving from the host, and the transport it arrived on. */
function useBrowserFeed(active: boolean) {
  const [view, setView] = useState<BrowserSessionView | null>(null);
  const [frame, setFrame] = useState<BrowserFrame | null>(null);
  const [blackout, setBlackout] = useState<BrowserBlackout | null>(null);
  const [status, setStatus] = useState<BrowserStatus>("fixtures");
  const transport = useRef<BrowserTransport | null>(null);

  useEffect(() => {
    if (!active) return;
    return attach(transport, transportFor, {
      setView,
      setFrame,
      setBlackout,
      setStatus,
    });
  }, [active]);

  return { view, frame, blackout, status, transport };
}

export function useBrowserSession(active: boolean): BrowserSession {
  const { view, frame, blackout, status, transport } = useBrowserFeed(active);
  const [refusal, setRefusal] = useState<RelayRefusal | null>(null);

  const relay = useCallback((input: RelayInput) => {
    void transport.current?.relay(input).then((outcome) => {
      setRefusal(outcome.ok ? null : outcome);
    });
  }, []);

  // Only explain a refusal when there was something to refuse. With no window
  // open, a diagnostic paragraph in the middle of a chat is noise about a
  // sandbox the shopper never asked for.
  const shown =
    status === "unauthorized" && view !== null
      ? REFUSED_VIEW
      : labelled(withFrame(view, frame, blackout), status);

  return {
    view: shown,
    status,
    refusal,
    relay,
    resume: () => {
      setRefusal(null);
      void transport.current?.resume();
    },
    takeover: () => {
      setRefusal(null);
      void transport.current?.takeover();
    },
    front: () => void transport.current?.front(),
    dismissRefusal: () => setRefusal(null),
  };
}
