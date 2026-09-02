# Landing page handover (paste this into the new session)

You are taking over the landing page for Saathi, an agentic-shopping product
built for the Razorpay AI Buildathon, in the repo at
C:\Users\coehe\Razorpay\covenant. The page lives at apps/landing (Vite +
React + TS workspace app, port 5199: `cd apps/landing && npx vite --port
5199`; build: `pnpm --filter @covenant/landing build`, which also bakes a
no-JS prerender). Repo gates that must stay green: `npx tsc -b`,
`npx eslint . --max-warnings 0`, `npx depcruise apps packages tools`.
Do not touch any other app in the repo.

## What the product is (the story you are selling)
An AI shopping agent whose strings stay in the user's hand. You give your
word once ("a navy kurta, under Rs 2,000, refundable"); Saathi walks the
shops in a window you can watch and take over; it refuses dark patterns in
your name; it returns with a bill; NOTHING is bought until you press and
hold for 600ms; every rupee lands in a readable ledger (the hisaab). No
technical vocabulary on the page ever: no covenant/mandate/ledger/AP2 words.
NO EM DASHES in any copy (hard rule).

## The creative direction the founder has converged on, after several rejected drafts
- The page is a STORY, fully immersive, told as a KATHPUTLI (Rajasthani
  string-puppet) show. The core line: "Every agent dances for someone. This
  one's strings stay in your hand."
- Nothing editorial: every scene is a full-bleed photographed stage with
  words floating in its light. No product-UI mockups (rejected as fussy),
  no hand-drawn SVG puppets or freehand "kolam lines" (rejected as
  scribbles; if a kolam appears it must be geometrically true), no generic
  SaaS hero/feature-grid layouts (rejected twice).
- Wanted: rich motion (reveals, parallax where cheap, scroll storytelling),
  background music (a toggle; source a licensed-ok tabla/tanpura loop or
  leave the wiring with a placeholder), interaction moments that reward
  exploration. "Minimal but good": density in choreography, not clutter.
- Study real references BEFORE designing: Behance/Dribbble/awwwards/
  godly.website, story-driven pages (Apple product pages for scroll
  mechanics), and Sarvam.ai for how one atmospheric color field + calm type
  + one ornament reads as designed. Fetch and LOOK at images; do not design
  blind.

## What already exists (current state, committed)
- apps/landing/src/sections/Story.tsx + Story.module.css: a 7-scene
  immersive draft (stage puppets hero, the worry, your word, the bazaar,
  the tricks, the hisaab, the thumb) with one shared indigo night scrim,
  three type voices (kicker/line/sub), CSS-only reveals.
- Real photos in apps/landing/public/img (Unsplash, local-testing only,
  license before public; ids in docs/landing-credits.md): stage-puppets,
  puppet-shadow, puppet-pair, puppet-rows, puppet-trio, rangoli-hand,
  bazaar-lane, pigment-rows, garland-strings, diya-hands, pigment-thali.
- Brand kit: Fraunces (display) + General Sans (body) + IBM Plex Mono
  (data) via link tags; tokens in src/styles/tokens.css (cream #FAF7F2,
  indigo #232196, saffron #E8740C, five pigments, sunrise gradient);
  the staggered five-pigment wordmark (chrome/Wordmark.tsx: KEEP, founder
  likes it); a working 600ms hold-to-sign Seal (kolam/Seal.tsx: KEEP).
- Unused older sections (Hero/Problem/Errand/Hisaab/Covenant/etc.) still
  in the tree from prior drafts; free to delete or mine for fragments
  (the founder liked: "bas, A le lo" Hinglish beat, the REFUSED stamps,
  the spent-without-asking list, "Sab theek hai.").

## Hard performance rules (each was violated once and froze the page)
- NO ResizeObserver anywhere near elements your own code transforms or
  re-renders (two feedback loops froze the renderer).
- NO interleaved DOM read/write sweeps (batch reads, then writes).
- NO blur() transitions on large surfaces; transform/opacity only.
- Ideally: zero scroll listeners; one IntersectionObserver total (the
  current motion/useInView.ts does exactly this: build on it).
- prefers-reduced-motion respected; page must render sanely with JS off
  (the prerender bake covers this: keep it working).

## Founder's taste, distilled from the session
Immersive over informative; story over product; real assets over drawn
mockups; Indian identity with dignity (kathputli, rangoli, bazaars, hisaab,
Devanagari accents) and never kitsch; bold committed compositions over
cream emptiness; precision in any geometric motif; one strong idea executed
deeply beats three mediocre sections. If a draft could pass for a generic
AI startup page, reject it yourself and redesign before showing it.
