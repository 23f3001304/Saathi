// A picker that pins the agent to one language is the wrong shape for a
// product used in a country where people change script mid-sentence. Verified
// against Sarvam before building on it: `language_code: "unknown"` transcribed
// Hindi audio correctly and reported back `hi-IN` — it detects, and it says
// what it decided.
import { describe, expect, it } from "vitest";

import {
  DETECT,
  reportedLanguage,
  scriptLanguageOf,
  speakingLanguage,
} from "../src/voice/detectedLanguage.ts";

describe("reading a language off the words themselves", () => {
  it("knows Devanagari", () => {
    expect(scriptLanguageOf("मुझे नीला कुर्ता चाहिए")).toBe("hi-IN");
  });

  it("knows Tamil, Telugu, Bengali and Malayalam apart", () => {
    expect(scriptLanguageOf("எனக்கு ஒரு சட்டை வேண்டும்")).toBe("ta-IN");
    expect(scriptLanguageOf("నాకు ఒక చొక్కా కావాలి")).toBe("te-IN");
    expect(scriptLanguageOf("আমার একটা জামা চাই")).toBe("bn-IN");
    expect(scriptLanguageOf("എനിക്ക് ഒരു കുപ്പായം വേണം")).toBe("ml-IN");
  });

  it("says nothing about Latin script, which is not evidence of English alone", () => {
    expect(scriptLanguageOf("mujhe neela kurta chahiye")).toBeNull();
  });

  it("follows the Indic half of a mixed sentence", () => {
    expect(scriptLanguageOf("Sure, मैं देखता हूँ")).toBe("hi-IN");
  });
});

describe("what the engine reported", () => {
  it("takes a language the picker offers", () => {
    expect(reportedLanguage("hi-IN")).toBe("hi-IN");
  });

  it("ignores anything it does not recognise", () => {
    expect(reportedLanguage("unknown")).toBeNull();
    expect(reportedLanguage(42)).toBeNull();
  });
});

describe("which voice answers", () => {
  it("answers in the language the reply is written in", () => {
    expect(speakingLanguage("ज़रूर, देखता हूँ", null, DETECT)).toBe("hi-IN");
  });

  it("falls back to what was heard when the reply gives nothing away", () => {
    expect(speakingLanguage("ok", "ta-IN", DETECT)).toBe("ta-IN");
  });

  it("honours an explicit choice when nothing else is known", () => {
    expect(speakingLanguage("ok", null, "bn-IN")).toBe("bn-IN");
  });

  it("does not let a stale choice override the language actually spoken", () => {
    expect(speakingLanguage("मुझे चाहिए", null, "en-IN")).toBe("hi-IN");
  });

  it("settles on English when there is nothing to go on", () => {
    expect(speakingLanguage("ok", null, DETECT)).toBe("en-IN");
  });
});
