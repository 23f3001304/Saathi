# The Katputli Show: Saathi landing design

Status: approved by the founder on 2026-09-05 (frame C, puppet F, voices
kabir / ishita / shubh, video as trailer only). Supersedes every struck draft
in `docs/landing-handover.md`; that file's KEEP list, taste rules and
performance rules still bind.

## What the page is

One cardboard toy theatre holds the whole page. The visitor never leaves it;
the flats change. Four planes deep (back wall, far flats, near flats,
puppets), moved by scroll and a light pointer tilt. Rod puppets, never
marionettes: every puppet enters from below on its stick with a quick rise, a
small overshoot and a settle, and leaves the same way. The page is the show,
not a page about one.

Audience: judges and shoppers arriving from the buildathon submission. The one
job: make them feel, in under a minute, that this agent stays under their
hand. No product vocabulary anywhere on the page. No em dashes.

## The show

| Curtain | What happens | On-screen line |
|---|---|---|
| Curtain up | Curtain halves part, the wordmark arrives behind them (existing `Wordmark`, delayed via `--wordmark-delay`), Saathi pops up centre and bows. Two doors below. | Every agent dances for someone. / This one dances for you. |
| Act 1, Your word | The shopper pops up with her bags and says her errand. A paper slip writes itself in her words. The visitor presses and holds the seal (existing `Seal` + `useHold`, 600 ms); the slip takes a pigment stamp; Saathi repeats the terms back. | You give your word once. It is written in your words. |
| Act 2, The walk | Scroll drives the stage: the bazaar flats slide, Saathi walks past three stalls, the shopkeeper pops up with scale and ledger and quotes. Mid-act the stage turns around: the backs of the flats, the sticks, the hands, and a cardboard window holding a real screenshot of the sandbox window from the running product. | You can watch every step. You can take the stick. |
| Act 3, The refusal | The tout pops up waving his tag; a REFUSED stamp slams; he pops again; stamp. Clicking him makes him try again with a new line; the counter reads "asked n times, refused n times"; he never wins. | It does not tire. |
| Act 4, The bill | Lights go down to the backlit night box. A paper scroll unrolls: three bills nobody asked for (Rs 18,999 headphones, Rs 1,29,000 laptop, Rs 42,350 flights, "no one asked"), then Saathi's one line, lit by the lamp. | Sab theek hai. |
| Curtain call | The cast bows in order as it scrolls into view; the paper programme footer (existing `Footer`); the wordmark bookend. | |

### Script (voices in Hindi, glosses are the on-screen English)

| Beat | Puppet | Voice | Line |
|---|---|---|---|
| Curtain | Saathi | kabir | हर एजेंट किसी न किसी के लिए नाचता है। मैं आपके लिए। |
| Word | Shopper | ishita | नेवी कुर्ता। दो हज़ार के अंदर। और वापस हो सके तो। |
| Word | Saathi | kabir | बस इतना, इससे ज़्यादा नहीं। आप दबाए रखिए, मैं लिख लेता हूँ। |
| Walk | Shopkeeper | anand | नेवी में तीन हैं। अठारह सौ पचास वाला वापस भी हो जाता है। |
| Walk | Saathi | kabir | यही। पर अभी नहीं। पहले वो देखें। |
| Refusal | Tout | shubh | बस, ए ले लो! सिर्फ़ दो बचे हैं! प्रोटेक्शन प्लान भी डाल दूँ? |
| Refusal, again | Tout | shubh | अरे, एक बार और सोच लो! आज ही का ऑफर है! / सिर्फ़ एक बचा है! अभी नहीं तो कभी नहीं! |
| Refusal | Saathi | kabir | नहीं। नहीं। पूछते रहिए, मैं थकता नहीं। |
| Bill | Saathi | kabir | एक कुर्ता, अठारह सौ पचास। आपने दबाया, तब गया। हिसाब यह रहा। सब ठीक है। |

## Interaction

- **You hold the stick.** Saathi's stick follows the pointer's x within the
  stage; the puppet follows with a spring (lag, overshoot, settle) and rocks
  about the base of its stick while moving. Touch drags. Nothing else on the
  page follows the pointer.
- **Press and hold** is the product's own 600 ms gesture; nothing stamps
  without it. One seal, in Act 1.
- **Turn the stage around** once, in Act 2, on a labelled control; the
  theatre rotates 180 degrees in CSS 3D to the back-of-theatre plate.
- **The tout loop**: click the tout to make him try again; the count is the
  joke; the stamp lands every time.
- **Sound is a footlight switch**, off by default, remembered in
  localStorage. On: the loop plays under everything and each puppet speaks
  its line once when it pops. Audio only ever starts from a user gesture.

## Assets

Generated with `gpt-image-2` from plates C, F and A as references; every
cutout has a real alpha channel; shipped as WebP under
`apps/landing/public/stage/`. Voices from Sarvam bulbul:v3, shipped as MP3
under `apps/landing/public/voice/`. Music loop from Flow Music under
`apps/landing/public/audio/loop.mp3`, only if licence-clean; the page must
quietly work without it.

Stage: `proscenium`, `curtain-half` (mirrored for the right), `footlights`,
`flat-stall-teal`, `flat-stall-indigo`, `flat-red-building`,
`flat-gold-arch`, `back-of-theatre`, `night-far`, `night-mid`, `night-near`,
`prop-slip`, `prop-lamp`. Cast: `saathi`, `shopper`, `shopkeeper`, `tout`.
The sandbox screenshot is captured from the running product at :5173, never
a mockup.

## Architecture

The existing Vite + React workspace app at `apps/landing`. New directories,
every file inside the 200 lines / 40 lines per function / complexity 8 limits:

- `src/stage/`: `Theatre` (proscenium, curtain, footlights, the 3D stage
  container and its planes), `Plane`, `Flat`, `Puppet` (a cutout on a stick
  with the pop entrance), `Stick` (the pointer-held puppet), `Turnaround`.
- `src/acts/`: `Curtain`, `Word`, `Walk`, `Refusal`, `Bill`, `Call`, one act
  per file, composing stage parts and copy.
- `src/sound/`: `lines.ts` (which file speaks for which beat), `useShowSound`
  (the switch, the loop, one utterance at a time), `Switch`.
- `src/motion/`: the existing `useInView` and `useHold`; a new `stickSpring`
  (pure math, tested) and `usePointerStick` (one pointer handler writing CSS
  variables, no state per frame).

Data flow: scroll moves planes through CSS scroll-driven animations
(`animation-timeline: view()`/`scroll()`) behind `@supports`, settled
fallback without; pop entrances are triggered by the one IntersectionObserver
flipping `[data-s]` to `.in`, reveal choreography in `base.css` as today; the
pointer stick writes `--stick-x` on the stage; sound listens to the same
`.in` flips to speak once per beat.

Rules carried over: zero scroll listeners, one IntersectionObserver, no
ResizeObserver, no blur, transform and opacity only, `prefers-reduced-motion`
renders the settled show, the prerender must render the settled show with
JavaScript off (every hidden-by-default style gated on `html[data-js]`).

## Error handling

A missing audio file removes itself quietly (the switch stays, the line is
skipped). Unsupported scroll timelines fall back to the settled composition.
Reduced motion disables pops, springs and the turnaround animation; the back
of the theatre is then a static second plate. Images carry width and height
so nothing reflows on load.

## Testing

The four gates. Vitest for the pure parts: `stickSpring` (settles, overshoots
once, never diverges), `lines` (every beat maps to an existing file name),
the sound state machine (off by default, one utterance at a time, gesture
before play). Visual verification by headless puppeteer screenshots per act
at 1440x900 and 390x844, looked at before any claim. A JS-off render of the
prerender checked for every act's copy.

## The trailer (not the page)

Five 8-second scenes, one per act, on Veo 3.1 Quality at 1080p in Flow,
using the cast PNGs as ingredients so the puppets match the page; Sarvam
voices and the Flow Music loop muxed with ffmpeg. Veo output carries a
visible watermark in this region, so it is the pitch film's opening and a
social cut, never page footage.

## Out of scope

Other reply languages for the voices; a CMS; analytics; anything that reads
the visitor's data. The music loop's licence is checked before the page is
public; until then the switch plays voices only.

## Revision, 2026-09-05 evening: one scroll, one stage, WebGL

The founder rejected the first build on sight: acts as boxes in a column
read as "a page with pictures of a show". The design above stands for the
story, the cast, the script and the interactions; the page structure is
replaced by this:

- One fixed full-viewport WebGL canvas (three.js) draws the cardboard
  theatre in real depth: cutout planes with alpha-tested shadows, a warm
  key light, footlight spot, a backlit night rig, a camera that leans with
  the pointer. Puppets stand on stick meshes and rotate about their base.
- The whole story is scrubbed by scrolling: the page is `SCROLL_VH`
  viewport heights tall; `evaluate(CHOREOGRAPHY, progress)` produces a pose
  for every object each frame; scrolling back plays it backward. There are
  no sections.
- The script is Saathi narrating its own show in English, with the puppets
  speaking Hindi lines under paper speech bubbles anchored to their heads,
  glossed in English. Narrator lines are subtitles. Every character line
  flaps the puppet's mouth (a second texture with the mouth open) for the
  line's recorded length, with the sound on or off.
- Files: `src/show/contract.ts` (shared types and stage space),
  `script.ts`, `choreography.ts` + `choreography-set.ts`, `evaluate.ts`,
  `useScrollProgress.ts`, `ScrollShow.tsx` and overlays; `src/webgl/*` for
  the scene. The DOM theatre (`stage/Theatre`, `Cast`, `acts/*`) is deleted.
- Veo clips are not on the page (visible watermark in this region); they
  remain the trailer's material.
