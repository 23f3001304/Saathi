import type { Logger } from "@covenant/domain";

import type { BeatRecorder } from "./beat-hub.js";
import type { BeatLog } from "./beat-log.js";
import type { ChatBeat, OptionRowData } from "./chat-beat.js";

export interface RestoredBeat {
  readonly epoch: number;
  readonly index: number;
  readonly beat: ChatBeat;
}

export interface BeatCursorView {
  readonly epoch: number;
  readonly index: number;
}

export interface RestoredConversation {
  readonly beats: readonly RestoredBeat[];
  /** Where a live stream should resume; null when the hub wrote nothing. */
  readonly cursor: BeatCursorView | null;
}

/** Rows the hub never published — the shopper's own turn — are marked with it. */
const NOT_A_HUB_BEAT = 0;

/**
 * The rule this log keeps: actions, never frames. A PNG is large and is full of
 * page content captured incidentally, so an inline image is dropped rather than
 * archived; the sandbox beat itself is assembled from the session view, which
 * has never held a picture.
 */
function withoutInlineImage(row: OptionRowData): OptionRowData {
  // Destructured rather than rebuilt field by field: a row that grows a field
  // (provenance, the listing it was read off) must not lose it here silently.
  const { imageUrl, ...kept } = row;
  const inline = imageUrl !== undefined && !imageUrl.startsWith("http");
  return inline ? kept : row;
}

function persistable(beat: ChatBeat): ChatBeat {
  if (beat.kind !== "options") return beat;
  return { ...beat, options: beat.options.map(withoutInlineImage) };
}

/**
 * The conversation, kept past the process that held it.
 *
 * DECISION: a beat is filed under the conversation the run was started for, and
 * a run started without one is not filed at all. Why: the id is what makes a
 * transcript reconstructible by a client that was not there, and a beat with
 * nowhere to belong would be a row nobody can ever ask for. The CLI and the e2e
 * post without an id and are unaffected — they read the run's result, not a
 * transcript.
 */
export class ConversationBeatStore implements BeatRecorder {
  private chat: string | null = null;

  constructor(
    private readonly log: BeatLog,
    private readonly logger: Logger,
  ) {}

  /** The epoch a fresh hub must start at so a restart never reuses one. */
  get startEpoch(): number {
    return this.log.lastEpoch + 1;
  }

  /** The turn about to run, and the sentence that started it. */
  open(conversationId: string | null, said: string): void {
    this.chat = conversationId;
    if (conversationId === null) return;
    this.write(conversationId, NOT_A_HUB_BEAT, NOT_A_HUB_BEAT, {
      offsetMs: 0,
      kind: "buyer",
      text: said,
    });
  }

  record(epoch: number, index: number, beat: ChatBeat): void {
    const chat = this.chat;
    if (chat === null) return;
    this.write(chat, epoch, index, persistable(beat));
  }

  history(conversationId: string): RestoredConversation {
    const beats = this.log.read(conversationId).map((row) => ({
      epoch: row.epoch,
      index: row.index,
      beat: JSON.parse(row.json) as ChatBeat,
    }));
    const streamed = beats.filter((entry) => entry.epoch !== NOT_A_HUB_BEAT);
    const last = streamed[streamed.length - 1];
    return {
      beats,
      cursor:
        last === undefined ? null : { epoch: last.epoch, index: last.index },
    };
  }

  private write(
    chat: string,
    epoch: number,
    index: number,
    beat: ChatBeat,
  ): void {
    try {
      this.log.append(chat, {
        epoch,
        index,
        kind: beat.kind,
        json: JSON.stringify(beat),
      });
    } catch (cause) {
      // A conversation that cannot be written down is still a conversation.
      this.logger.warn("chat.beats.write_failed", {
        kind: beat.kind,
        cause: cause instanceof Error ? cause.message : "unknown",
      });
    }
  }
}
