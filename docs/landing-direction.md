# Saathi landing: art direction

Written before implementation, per the founder's brief (§13, §14). References studied:
Sarvam (refined Indian modernism: jali geometry, marigold warmth, wide confident
wordmark, "meaning conveyed without explanation"), the 2025 Awwwards site of the
year and adjacent editorial winners (principles taken: the hero must stand as a
still frame; kinetic type earns its motion through restraint; sections transition
as camera moves over one continuous surface; motion paces a story; 60fps on a
mid-range phone or it does not ship). Principles derived, no layout copied.

## 1. Art direction: "The Deed"

The page is not a website about Saathi. It is the covenant itself: one long deed
on cream stamp paper, read top to bottom, clause by clause, countersigned at the
end. Every landing convention is translated into document furniture. Nav links
are clause references. Sections are numbered clauses under oversized Fraunces
numerals set as watermarks. IBM Plex Mono marginalia annotate the reading the
way an audit column annotates a ledger. One continuous kolam line is drawn down
the margin as you read: a kolam is a threshold drawing of welcome, and an
unbroken line is precisely the product's claim about its audit trail. The agent
is a guest at your door; the page draws the welcome and then states the rules of
the house. The footer is the signature block, where the wordmark returns
oversized and the pigments return one last time.

Indian identity is the spine, not a garnish: the kolam threshold under the hero,
the five-pigment toran arch standing over the covenant clause like the arch over
a doorway, the Bakhshali zero (the oldest written zero, from an Indian
manuscript) closing the trust clause, a single Devanagari साथी moment in the
hero and again in the footer, and the sunrise edge at the very top. Dignified,
drawn, never clip art. Why it cannot be mistaken for a SaaS template: cream
paper, ink hairlines, clause numerals a viewport tall, rubber-stamp chips at one
degree of rotation, a scroll-drawn kolam, rupee ledger marginalia, radius 0/2px
only, no gradients except three pixels of sunrise, no cards with soft shadows,
no purple.

## 2. Type scale

- Wordmark: Fraunces, clamp(88px, 17vw, 248px), opsz 144, wght 540, -0.03em
- Clause numeral (watermark): Fraunces, clamp(140px, 24vw, 340px), ink at 5-7%
- Statement (display-xl): Fraunces, clamp(38px, 6vw, 88px) / 1.04, -0.025em
- Display-l: Fraunces, clamp(26px, 3.4vw, 44px) / 1.15, -0.02em
- Body-l: General Sans 500, 18px/28; body-m 15px/23
- Mono: IBM Plex Mono, 13px/20; data-l 18px/24; every rupee tabular
- Label: 11px/12 uppercase, 0.04em tracking (house rule: never wider)
- Accent: Anek Devanagari for साथी only

## 3. Grid

12 columns, max 1360px, 24px gutter, 8px baseline. A 76px margin rail on the
left at >=980px carries the drawn thread. Statements sit on columns 1-8;
evidence fragments sit on columns 6-12 and overlap the statement block upward,
so every clause is two layers deep. Marginalia float in columns 10-12. Below
980px the rail collapses, layers stack, and the option cards become a snap-
scrolling row (the one horizontal moment, kept on mobile where it is native).

## 4. Motion system

Curves and durations are the product's own (motion/presets.ts, verbatim):
- ease-out cubic-bezier(.25,1,.5,1): entrances 550ms, hovers 120ms
- ease-stamp cubic-bezier(.34,1.2,.64,1): anything that lands (stamps, seals,
  pills, ticks) 260ms
- ease-snap cubic-bezier(.7,0,.84,0): refusals and strikes, 180ms
- ease-draw cubic-bezier(.16,.84,.44,1): line drawing, 600ms
- Stagger unit 38ms (StreamText's word stagger). Hold-to-sign is 600ms linear,
  the product's exact gesture; an eased bar would lie about how long is left.
- The signature entrance everywhere: arrive staggered, wet with one of the five
  pigments, dry to ink (StreamText's wordIn, promoted to display scale).
Implementation: CSS transforms/animations + IntersectionObserver + one rAF
scroll subscription. No animation library. transform/opacity/stroke-dashoffset
only. prefers-reduced-motion collapses everything to settled states; with JS
disabled the page renders fully settled and legible.

## 5. Hero concept

The name lands first: S-a-a-t-h-i staggered in per-character pigment, drying to
ink, over a faint साथी set vertical. Under it the one-line pitch as a sworn
statement, then the covenant plate (deed number, date, parties). The kolam
threshold is drawn beneath the fold line. Discoverable interaction: the ink is
still wet; moving the cursor across the wordmark presses weight into the
letters near it (variable-font wght, six spans, one rAF). The first viewport
answers: an agent that shops for you (what), that cannot spend what you did not
sign (why care), because the limits are a signed document, not a promise (how
different), set like a deed, warm like a threshold (what the brand feels like).

## 6. Scroll story

Preamble (hero) -> The problem: "a blank cheque" (the unbounded terminal;
hover stamps each cleared call "no one asked"; a counter climbs) -> Clause 01,
the covenant (limit lines that explain what they refuse on hover; hold-to-sign
signs the deed and stamps it IN FORCE) -> Clause 02, the errand (step pills;
the sandboxed browser with an agent cursor that yields the wheel on
hover/press; option cards with evidence chips, "Nobody paid to be here") ->
Clause 03, the machinery (eight verdict seals with their real names; a refused
execute_payment you can re-run; a hash-chained ledger with a "flip one byte"
tamper toggle that breaks the chain downstream and stops the spend) -> the
signature (hold-to-witness rosette + Watch the demo / Read the architecture) ->
footer bookend.

## 7. Footer concept

The signature block: the wordmark returns at hero scale and re-inks pigment by
pigment under the cursor, साथी glossed "companion" beside it, clause navigation
set as an index, the Bakhshali zero as the colophon: India gave the ledger its
zero; this ledger gives your agent one. Zero unsigned spends.

## v3 whiteboard (after the Behance/Dribbble/godly reference pass, 2026-09-02)

What the strong references share that v2 lacked: a hero OBJECT (a card, a
phone, a dashboard: something with mass), bold PANEL BLOCKING (rounded
full-width panels, committed dark sections, not uniform paper), and the
product shown concretely inside frames. Identity was right; mass was missing.

Blocking rhythm, top to bottom:
1. HERO on paper: toran bloom + staggered name + kolam line (keep), and NEW:
   a layered product stack on the right at real scale: the bill card with a
   live hold-to-sign seal inside it, the browser card behind it with step
   pills, a refusal chip floating over the corner. Three cards, one glance,
   the whole product. The seal in the bill IS the discoverable interaction.
2. THE WORRY: the rogue-agent terminal committed to a full dark ink panel,
   rounded 20px, inset from the edges: the first dark block.
3. YOUR WORD: paper, editorial (keep).
4. THE SHOPPING: the live demo sunk into a paper-sunk band, edge to edge.
5. THE HISAAB: the second dark panel: ink ground, cream text, mono ledger
   light-on-dark, crimson REFUSED. The two dark panels frame the story.
6. FINALE + FOOTER bookend (keep).

Motion: unchanged system (blur-reveal, kolam draw, stagger); the hero stack
enters as three staggered blur-reveals, back card first.
