/**
 * The story, as it is spoken and read. Saathi narrates its own show in
 * English and the puppets speak Hindi with an English gloss under the
 * bubble. `at` is scroll progress from 0 to 1; `seconds` is the length of
 * the recorded line, which also times the mouth when the sound is off.
 */
export type Speaker = "narrator" | "saathi" | "shopper" | "shopkeeper" | "tout";

export interface Line {
  readonly id: string;
  readonly at: number;
  readonly speaker: Speaker;
  readonly text: string;
  readonly gloss?: string;
  /** MP3 stem under /voice/. */
  readonly voice: string;
  readonly seconds: number;
  readonly title?: string;
}

export const SCRIPT: readonly Line[] = [
  { id: "open", at: 0.03, speaker: "narrator", voice: "nar-01", seconds: 4.98,
    text: "Every agent dances for someone. Let me show you who I dance for." },
  { id: "meera", at: 0.08, speaker: "narrator", voice: "nar-02", seconds: 4.62,
    text: "This is Meera. She wanted one thing, and she said it once." },
  { id: "shopper-word", at: 0.11, speaker: "shopper", voice: "shopper-01", seconds: 3.99,
    text: "नेवी कुर्ता। दो हज़ार के अंदर। और वापस हो सके तो।",
    gloss: "Navy kurta. Under two thousand. Returnable, if it can be." },
  { id: "others", at: 0.15, speaker: "narrator", voice: "nar-03", seconds: 7.32,
    text: "Other agents heard that and bought her headphones. Then a laptop. Then a flight to Goa. Nobody asked." },
  { id: "not-me", at: 0.205, speaker: "narrator", voice: "nar-04", seconds: 1.83,
    text: "I do not work like that." },
  { id: "saathi-word", at: 0.23, speaker: "saathi", voice: "saathi-01", seconds: 2.45,
    text: "बस इतना। इससे ज़्यादा नहीं।", gloss: "Just that. Not a rupee more." },
  { id: "slip", at: 0.26, speaker: "narrator", voice: "nar-05", seconds: 9.29,
    text: "Her words go on a slip, in her words. Then she presses and holds. From then on, that slip is all I am allowed to do." },
  { id: "saathi-hold", at: 0.305, speaker: "saathi", voice: "saathi-02", seconds: 4.25,
    text: "आप दबाए रखिए, मैं लिख लेता हूँ।", gloss: "Press and hold. I will write it down." },
  { id: "walk", at: 0.34, speaker: "narrator", voice: "nar-06", seconds: 7.42,
    text: "Then I walk the shops, in a window she can watch. Every page I read, every button I press, she sees." },
  { id: "keeper", at: 0.40, speaker: "shopkeeper", voice: "keeper-01", seconds: 3.9,
    text: "नेवी में तीन हैं। अठारह सौ पचास वाला वापस भी हो जाता है।",
    gloss: "Three in navy. The 1,850 one can come back too." },
  { id: "saathi-pick", at: 0.44, speaker: "saathi", voice: "saathi-03", seconds: 2.8,
    text: "यही। पर अभी नहीं। पहले वो देखें।", gloss: "This one. But not yet. First, she looks." },
  { id: "stick", at: 0.47, speaker: "narrator", voice: "nar-07", seconds: 5.07,
    text: "And if she wants the stick, it is hers. Any time. That is the whole trick." },
  { id: "him", at: 0.535, speaker: "narrator", voice: "nar-08", seconds: 2.37,
    text: "Every shop has one of him." },
  { id: "tout-1", at: 0.56, speaker: "tout", voice: "tout-01", seconds: 2.14,
    text: "बस, ए ले लो! सिर्फ़ दो बचे हैं!", gloss: "Just take it! Only two left!" },
  { id: "tout-2", at: 0.59, speaker: "tout", voice: "tout-02", seconds: 1.39,
    text: "प्रोटेक्शन प्लान भी डाल दूँ?", gloss: "Shall I add a protection plan?" },
  { id: "tout-3", at: 0.62, speaker: "tout", voice: "tout-03", seconds: 1.54,
    text: "अभी नहीं तो कभी नहीं!", gloss: "Now or never!" },
  { id: "saathi-no", at: 0.65, speaker: "saathi", voice: "saathi-04", seconds: 3.05,
    text: "नहीं। पूछते रहिए, मैं थकता नहीं।", gloss: "No. Keep asking. I do not tire." },
  { id: "tires", at: 0.675, speaker: "narrator", voice: "nar-09", seconds: 4.62,
    text: "Asked three times, refused three times. He can ask all night." },
  { id: "bill", at: 0.70, speaker: "narrator", voice: "nar-10", seconds: 7.13,
    text: "Nothing is bought until she presses and holds once more. Then there is one line, where she can read it." },
  { id: "saathi-bill", at: 0.76, speaker: "saathi", voice: "saathi-05", seconds: 5.44,
    text: "एक कुर्ता, अठारह सौ पचास। आपने दबाया, तब गया।", gloss: "One kurta, 1,850. It went when you pressed." },
  { id: "theek", at: 0.80, speaker: "narrator", voice: "nar-11", seconds: 1.0,
    text: "Sab theek hai." },
  { id: "call", at: 0.85, speaker: "narrator", voice: "nar-12", seconds: 3.81,
    text: "That is the show. I am Saathi. I dance for you.", title: "Saathi dances for you." },
];
