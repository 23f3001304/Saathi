# Landing page handover (state as of 2026-09-02, evening)

You are taking over the landing page for Saathi, an agentic-shopping product
built for the Razorpay AI Buildathon, in the repo at
C:\Users\coehe\Razorpay\covenant. The page lives at apps/landing (Vite +
React + TS workspace app, port 5199: `cd apps/landing && npx vite --port
5199`; build: `pnpm --filter @covenant/landing build`, which also bakes a
no-JS prerender). Repo gates that must stay green: `npx tsc -b`,
`npx eslint . --max-warnings 0`, `npx depcruise apps packages tools`.
Do not touch any other app in the repo.

## CURRENT STATE: all landing work deleted at founder's request (09-02, late evening)

Five complete drafts were staged and struck in one day. After the fifth
the founder said to delete the landing work entirely, and it is deleted.
The page shows only the minimal holding screen (wordmark, one promise
line, two links, footer). All gates pass; the prerendered no-JS build
works. Do NOT design a sixth draft unprompted. If this page is picked
up again, the realistic paths are: the founder steers micro-edits live,
one at a time, while looking at the page; or the founder supplies one
specific reference page to port faithfully; or the holding page ships
as-is for the submission (it is presentable). Real screenshots of the
running product were captured and liked in principle ("the real thing,
not a mockup"); re-capture from :5173 in minutes (continue as demo
user, hold the seal, then screenshot Chat / Ledger / the refused chip).

## What the product is (the story you are selling)

An AI shopping agent that stays under the shopper's hand. You give your
word once ("a navy kurta, under Rs 2,000, refundable"); Saathi walks the
shops in a window you can watch and take over; it refuses dark patterns in
your name; it returns with a bill; NOTHING is bought until you press and
hold for 600ms; every rupee lands in a readable ledger (the hisaab). No
technical vocabulary on the page ever: no covenant/mandate/ledger/AP2 words.
NO EM DASHES in any copy (hard rule).

## The taste map: five struck drafts and why they died

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
