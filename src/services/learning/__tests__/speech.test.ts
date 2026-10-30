import { describe, expect, it } from "vitest";
import {
  formatTextForSpeech,
  isNoveltyVoiceName,
  pickBestBrowserVoice,
  type BrowserVoiceLike,
} from "../speech";

describe("speech service (natural TTS voice ranking & text sanitization)", () => {
  it("blocks macOS MacInTalk novelty joke voices like Albert, Fred, Boing, and Zarvox", () => {
    const noveltySamples = [
      "Albert",
      "Bad News",
      "Bahh",
      "Bells",
      "Boing",
      "Bubbles",
      "Cellos",
      "Eddy (English (US))",
      "Flo (English (US))",
      "Fred",
      "Good News",
      "Grandma (English (US))",
      "Jester",
      "Organ",
      "Ralph",
      "Superstar",
      "Trinoids",
      "Whisper",
      "Wobble",
      "Zarvox",
    ];
    for (const name of noveltySamples) {
      expect(isNoveltyVoiceName(name), `Expected "${name}" to be blocked`).toBe(
        true
      );
    }

    const naturalSamples = [
      "Samantha",
      "Samantha (Enhanced)",
      "Ava (Premium)",
      "Daniel",
      "Serena (Enhanced)",
      "Karen",
      "Google US English",
    ];
    for (const name of naturalSamples) {
      expect(isNoveltyVoiceName(name), `Expected "${name}" to be allowed`).toBe(
        false
      );
    }
  });

  it("never picks alphabetical default Albert on macOS and ranks Premium > Enhanced > Samantha", () => {
    const macWebKitVoices: BrowserVoiceLike[] = [
      { name: "Albert", lang: "en-US", default: true },
      { name: "Bad News", lang: "en-US" },
      { name: "Bahh", lang: "en-US" },
      { name: "Boing", lang: "en-US" },
      { name: "Fred", lang: "en-US" },
      { name: "Daniel", lang: "en-GB" },
      { name: "Samantha", lang: "en-US" },
      { name: "Zarvox", lang: "en-US" },
    ];

    const pickedDefaultMac = pickBestBrowserVoice(macWebKitVoices, "en-US");
    expect(pickedDefaultMac?.name).toBe("Samantha");

    const withEnhancedAndPremium: BrowserVoiceLike[] = [
      ...macWebKitVoices,
      { name: "Samantha (Enhanced)", lang: "en-US" },
      { name: "Ava (Premium)", lang: "en-US" },
    ];
    const pickedPremium = pickBestBrowserVoice(withEnhancedAndPremium, "en-US");
    expect(pickedPremium?.name).toBe("Ava (Premium)");
  });

  it("formats Markdown, inline code, and math notation into natural spoken English", () => {
    const raw =
      "An interface like `type Scorer interface { Score() int }` checks matching methods, while $\\frac{a}{b} \\geq 2$ holds.\n```go\nfunc main() {}\n```";
    const spoken = formatTextForSpeech(raw);

    expect(spoken).not.toContain("\\frac");
    expect(spoken).not.toContain("{");
    expect(spoken).not.toContain("}");
    expect(spoken).not.toContain("func main");
    expect(spoken).toContain("a over b is at least 2");
    expect(spoken).toContain("type Scorer interface");
  });
});
