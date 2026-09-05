# Landing page handover (state as of 2026-09-05, night)

You are taking over the landing page for Saathi at apps/landing (Vite +
React + TS, port 5199: `pnpm --filter @covenant/landing dev`, or the
Browser pane's "landing" entry in .claude/launch.json; build:
`pnpm --filter @covenant/landing build`, which bakes a no-JS prerender).
Gates: `npx tsc -b && npx eslint . --max-warnings 0 && npx depcruise apps
packages tools && npx vitest run` (the landing tests are the `landing`
vitest project).

## CURRENT STATE: the katputli show, one scroll, one picture

The page is a cardboard puppet show that the scroll performs. Everything
lives under `src/show` (runtime), `src/film` (the picture as a scrubbed
video), `src/webgl` (the picture as a three.js cardboard theatre, the
fallback when no film is present), `src/sound` (voices and the switch).
Spec: docs/superpowers/specs/2026-09-05-katputli-show-design.md (its
revision section is the current shape). Plan and history:
docs/superpowers/plans/2026-09-05-katputli-show.md.

- `src/show/script.ts` is the story: Saathi narrates in English (Sarvam
  bulbul:v3, voice kabir, en-IN), the puppets speak Hindi (ishita, anand,
  shubh) with an English gloss in a paper bubble. MP3s under public/voice.
  `seconds` per line is measured with ffprobe and times the lip flap.
- `src/show/choreography*.ts` is the cardboard stage's timeline (used by the
  WebGL fallback only). `src/film/remap.ts` maps the script's `at` values
  onto the film's five equal scenes.
- The film is `public/stage/film.mp4`: five 8 s scenes, 1280 wide, a
  keyframe every 8 frames so seeks land instantly, no audio. Build it with
  the scratch script `build-film.sh` (five clips in order) and the trailer
  with `build-trailer.sh`; both live in the 2026-09-05 session scratchpad
  under `trailer/`, with the narration bed and end card beside them. The
  file shipped at the time of writing is provisional (Omni clips, scenes 2
  and 4 doubled); the Veo 3.1 Lite rerun, referenced to the founder's
  chosen clip "Cardboard puppet waving on stage", replaces it.
- Sound starts only from the "begin the show" click (browser autoplay
  rules); lines play exactly inside their scroll window and stop when the
  reader leaves it; the switch bottom-left mutes. `public/audio/loop.mp3`
  is optional (Flow Music, "Paper Puppet Theatre Loop 1", not yet
  downloaded); the page runs without it.
- Cutout assets (`public/stage/*.webp`, mouth-open variants
  `<name>-open.webp`) are baked by `scripts/pieces.py` from the session's
  gpt-image-2 PNGs.

What the founder rejected on sight today, so nobody rebuilds it: acts as
boxes in a column (not immersive), a theatre that does not fill the screen,
subtitles on kraft cards, sound queued behind the scroll instead of locked
to it, and any generated video with writing in it (video models garble
text; every slip and scroll in a shot must be blank, words go on as HTML).

## What the product is (the story you are selling)

An AI shopping agent that stays under the shopper's hand. You give your
word once ("a navy kurta, under Rs 2,000, refundable"); Saathi walks the
shops in a window you can watch and take over; it refuses dark patterns in
your name; it returns with a bill; NOTHING is bought until you press and
hold for 600ms; every rupee lands in a readable ledger (the hisaab). No
technical vocabulary on the page ever: no covenant/mandate/ledger/AP2 words.
NO EM DASHES in any copy (hard rule).

## The taste map: eight struck drafts and why they died

1. Photo-editorial draft (multiple sections, product-UI mockups):
   rejected as fussy and generic SaaS.
2. Photographed story scenes (7 full-bleed Unsplash photos, one indigo
   scrim, kicker/line/sub repeated per scene): rejected. "A club of
   random images"; one composition repeated seven times; the photos
   (seven photographers) never read as one show. All photos are now
   DELETED from the repo along with docs/landing-credits.md, which also
   deleted the licensing debt. Do not bring stock photography back.
3. Cardboard toy theatre (no images at all; CSS/SVG card proscenium,
   curtain rise, kraft floor, footlights, computed-geometry rod puppets
   on sticks, bazaar stall flats, scroll-scrubbed walk, refused stamps,
   paper ledger scroll): rejected on sight, "looks bad". Deleted.
4. Zainab-style illustrated world (founder reference zainabkabira.com;
   warm sky, cloud shapes, a geometric paper kite on a dashed string
   threading the page, real product screenshots in scene): killed
   mid-build as "a cheap looking bad copy" of the reference. The lesson:
   copying a crafted page's layout with flat primitives reads as a
   wireframe of it. Also from this round: santionispirits.com was the
   other reference (single ink-illustration style, story panels, a HOLD
   beat); museum CC0 Kalighat sourcing was explored and vetoed ("no
   mythological reference, we are a SaaS product"); and the standing
   rule NEVER MAKE ARTWORK, SOURCE IT was set.
5. Calm type-and-texture (founder-chosen direction via explicit menu:
   grain over a warm field, monumental faint kolam rosette as the one
   ornament paying off as the pressable seal, real screenshots, one dusk
   band, editorial spent-list): still hated ("font is very bad", "I hate
   your every generation"). A six-option type specimen went unanswered;
   then the delete order came. Deleted.
6. RiskSentinel port (founder reference risksentinel-x.vercel.app):
   light cream ground, alternating split sections, product cards on
   gradient pads, indigo closing band. Rejected as "still looks bad" and
   "don't exactly copy the feel" - a faithful port of a cool blue fintech
   page read as a clone, not as Saathi.
7. Same page rebuilt warm (Cabinet Grotesk + Switzer display type, saffron
   accents, sunrise closing band, masked line reveals, 100svh fold).
   Two real findings from this round, worth keeping:
   - Fontshare SILENTLY DROPS families from a combined f[] request. That
     is how the page shipped a headline in fallback serif while claiming
     Switzer. Always one family per <link>, and verify with document.fonts.
   - Cabinet Grotesk has no italic, and <em> is italic by browser default,
     so every accent word was being synthetically slanted. Accent with
     colour, not slope.
8. Sandbox hero: the agent driving a live shop window on a 15s CSS-only
   timeline (cursor path, pre-ticked extras being unticked, refused chips,
   odometer price roll, the wheel passing back to the reader, a 600ms hold
   fill). Rejected: "looks bad and is repeated" - the window was rendered
   twice (hero and section), the cursor path was expressed in percentages
   of its own box so it never reached the checkboxes it appeared to click,
   and the product image was the app's Truchet ProductPlate, which reads
   as wallpaper rather than a product.
   The founder then asked for "an actual amazon page photo". Not done, and
   worth flagging before anyone does it: baking a screenshot of Amazon's
   product page into a public marketing site means publishing their page
   design, their product photography and their trademark, and is a real
   legal exposure for a repo that is about to go public. The repo already
   ships its OWN demo storefront at packages/browser-drive/fixtures/shop/
   (product.html, checkout.html, cart.html and friends). Screenshotting
   that is real, is ours, and carries no third-party rights problem. That
   is the route to take if a realistic shop page is needed.

Standing founder rules distilled across all three rejections:
- The page must BE a live show, not a page about a show.
- No photographs. No product-UI mockups. No hand-drawn/freehand SVG
  (scribbles). Geometry, if any, must be computed and precise.
- If puppets ever return: hand-controlled rod/stick puppets (Candy
  Crush-style pop-up feel), NOT marionettes with strings.
- Immersive over informative, one strong idea executed deeply, bold
  committed compositions, Indian identity with dignity and never kitsch.
- If a draft could pass for a generic AI startup page, kill it yourself.
- Wanted: rich motion, background music (toggle), interaction moments
  that reward exploration. "Minimal but good."

## What exists now (all founder-KEEPs, intact)

- chrome/Wordmark.tsx: staggered five-pigment wordmark. KEEP. It now
  takes two CSS hooks: --wordmark-delay (postpone the arrival, e.g.
  behind a curtain) and --wordmark-memory (the surviving pigment of the
  last letter; default indigo, set marigold on dark grounds).
- chrome/SaathiMark.tsx: the five-tile toran mark. KEEP.
- kolam/Seal.tsx + rosette-path.ts + motion/useHold.ts: the working
  600ms hold-to-sign seal. KEEP.
- motion/useInView.ts: the page's ONE IntersectionObserver; flips
  [data-s] elements to .in once. base.css holds the reveal choreography,
  including a [data-pop] variant (rise-from-below entrance with
  overshoot; transform goes on the wrapper's CHILD so the observed
  wrapper never leaves the viewport - a fully clipped element never
  intersects and would never reveal).
- styles/tokens.css + styles/base.css: brand kit (Fraunces / General
  Sans / IBM Plex Mono / Anek Devanagari; cream #FAF7F2, indigo #232196,
  saffron #E8740C, five pigments, sunrise gradient).
- sections/Footer.tsx: the paper programme footer, founder-liked.
- scripts/prerender.mjs + src/prerender.tsx: no-JS bake. IMPORTANT: any
  style that hides content by default MUST be gated on html[data-js],
  or the no-JS page renders blank (draft 2 shipped this bug).
- content/links.ts: DEMO_URL / BUILD_URL placeholders, swap before
  publishing.

## Copy fragments the founder likes (reuse freely)

The "bas, A le lo" Hinglish dialogue beat; the REFUSED stamps ("asked n
times, refused n times, it does not tire"); the spent-without-asking
list (Rs 18,999 headphones / Rs 1,29,000 laptop / Rs 42,350 flights,
"no one asked"); "Sab theek hai."; "Every agent dances for someone."
survived all three drafts as the core line and is still true for rod
puppets.


## Hard performance rules (each was violated once and froze the page)

- NO ResizeObserver anywhere near elements your own code transforms or
  re-renders (two feedback loops froze the renderer).
- NO interleaved DOM read/write sweeps (batch reads, then writes).
- NO blur() transitions on large surfaces; transform/opacity only.
- Zero scroll listeners (the old TopBar's one was removed; keep it at
  zero); one IntersectionObserver total (useInView). CSS scroll-driven
  animation (view-timeline) is allowed and worked well, gated behind
  @supports with a settled fallback.
- prefers-reduced-motion respected; page must render sanely with JS off.

## Music

The founder wants a tabla/tanpura loop under the show, behind a toggle.
A licensed loop has not been sourced. The last draft had working wiring
(lazy Audio element, /audio/show-music.mp3, quiet self-removal if the
file is missing); it was deleted with the draft but is trivial to
recreate. Source a licence-clean loop before the page goes public.

## Verification loop that worked well

The Browser pane may be unavailable; headless puppeteer (already in the
workspace via packages/browser-drive) screenshots every act reliably:
launch, viewport 1440x900, goto localhost:5199, scroll to each section
id, wait ~1.5s for reveals, screenshot. Look at every image before
claiming anything about the page.
