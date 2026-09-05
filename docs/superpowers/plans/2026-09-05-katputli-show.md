# The Katputli Show Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the holding page at `apps/landing` with the approved cardboard toy-theatre show: one reusable Theatre, rod puppets that pop up on sticks, a pointer-held stick, a footlight sound switch with Sarvam voices, and five acts plus a curtain call.

**Architecture:** Every act renders its own `Theatre` (proscenium, curtain, footlights, four parallax planes) from a `Scene` data object and drops its cast in as children; entrances reuse the existing `[data-s][data-pop]` choreography and the one IntersectionObserver in `useInView`. Motion is CSS (transitions, keyframes, scroll-driven `view()` timelines behind `@supports`); the only per-frame JavaScript is the stick spring, which runs while a pointer moves over the hero stage and stops when settled. Sound is a small pure state machine behind a React context; audio only starts from a click.

**Tech Stack:** Vite 8 + React 18 + TypeScript (existing workspace app), CSS Modules, vitest (node environment) for pure modules, PIL for the asset bake, ffmpeg for voice conversion, the in-app Browser pane for visual verification.

**Spec:** `docs/superpowers/specs/2026-09-05-katputli-show-design.md`

## Global Constraints

- Every file stays inside eslint's limits: 200 lines per file, 40 lines per function, complexity 8.
- All four gates green before every commit: `npx tsc -b && npx eslint . --max-warnings 0 && npx depcruise apps packages tools && npx vitest run`.
- No em dashes anywhere in user-visible copy (a test enforces it for `copy.ts`).
- No product vocabulary on the page: no covenant, mandate, ledger, AP2, sandbox as words a shopper reads.
- Zero scroll listeners; one IntersectionObserver (`useInView`); no ResizeObserver; no `filter: blur()`; transform and opacity only in transitions; `prefers-reduced-motion` renders the settled show; the prerender renders the settled show with JavaScript off (anything hidden by default is gated on `html[data-js]`).
- Rod puppets, never marionettes. No photographs, no product mockups, no freehand SVG. The one real screenshot is captured from the running product.
- KEEP components are used, not rewritten: `chrome/Wordmark`, `chrome/SaathiMark`, `kolam/Seal` + `motion/useHold`, `motion/useInView`, `sections/Footer`, `styles/tokens.css`, the prerender bake.
- Assets are generated cutouts with real alpha, shipped as WebP under `apps/landing/public/stage/`; voices as MP3 under `apps/landing/public/voice/`; the loop under `apps/landing/public/audio/loop.mp3` only when licence-clean.

---

## File structure

Created:
- `apps/landing/scripts/pieces.mjs`: bakes PNG cutouts to trimmed WebP and writes `src/stage/pieces.ts` (sizes come from the files, never typed by hand).
- `apps/landing/src/stage/pieces.ts` (generated): `PIECES`, `PieceName`, `pieceSrc()`.
- `apps/landing/src/stage/scenes.ts`: `Scene`, `SCENES` per act, `Depth`.
- `apps/landing/src/stage/Theatre.tsx` + `Theatre.module.css`: the stage.
- `apps/landing/src/stage/Curtain.tsx`: two curtain halves, opens once under JS.
- `apps/landing/src/stage/Cast.tsx` + `Cast.module.css`: a positioned puppet wrapper with the pop entrance, optional click, optional stick ref.
- `apps/landing/src/motion/stickSpring.ts`: pure spring math.
- `apps/landing/src/motion/usePointerStick.ts`: pointer to spring to CSS variables.
- `apps/landing/src/motion/useTilt.ts`: pointer to `--px/--py` on a stage.
- `apps/landing/src/sound/lines.ts`, `soundState.ts`, `SoundContext.tsx`, `useShowSound.ts`, `Switch.tsx` + `Switch.module.css`.
- `apps/landing/src/acts/Act.tsx` + `Act.module.css`: section shell (stage + copy grid).
- `apps/landing/src/acts/copy.ts`: every on-screen line.
- `apps/landing/src/acts/Hero.tsx`, `Word.tsx`, `Walk.tsx`, `Refusal.tsx`, `Bill.tsx`, `Call.tsx` (+ module CSS where an act has its own props).
- `apps/landing/src/Show.tsx`: composes acts, owns the sound context and the one `useInView`.
- `apps/landing/tests/*.test.ts`, `apps/landing/vitest.config.ts`.
- `.claude/launch.json`: the landing dev server for the Browser pane.

Modified:
- `apps/landing/src/App.tsx`, `App.module.css`: render `Show`.
- `apps/landing/src/motion/useInView.ts`: optional `onIn` callback for `[data-beat]`.
- `apps/landing/src/styles/base.css`: a `[data-down]` rule for a puppet dropping out of frame.
- `apps/landing/index.html`: title and description for the show.
- `vitest.config.ts` (root): add `landing` to the apps list.
- `docs/landing-handover.md`: replace the STOP header with the show's state (last task).

---

### Task 0: Commit the holding page as the base

**Files:**
- Modify: nothing new; the working tree already holds the founder's deletion of the photo draft.

- [ ] **Step 1: Confirm the tree is the holding page and gates are green**

Run: `cd C:/Users/coehe/Razorpay/covenant && git status --porcelain apps/landing | wc -l && npx tsc -b && npx eslint apps/landing --max-warnings 0`
Expected: about 51 changed paths under apps/landing (deletions of `public/img/*.jpg`, `sections/*`, `kolam/Band*`, `kolam/Thread*`, `motion/useInkPressure.ts`, `useParallaxAll.ts`, `useRevealAll.ts`, `chrome/TopBar*`; modifications to `App.tsx`, `App.module.css`, `index.html`, `links.ts`, `Footer.tsx`, `base.css`, `tokens.css`, `useInView.ts`, `Wordmark.module.css`, `docs/landing-handover.md`; new `public/favicon.svg`), tsc and eslint clean.

- [ ] **Step 2: Commit**

```bash
git add -A apps/landing docs/landing-handover.md
git commit -m "chore(landing): reduce to the holding page, drop the photo draft"
```

---

### Task 1: Assets into the app, and the test wiring

**Files:**
- Create: `apps/landing/scripts/pieces.mjs`
- Create (generated): `apps/landing/src/stage/pieces.ts`
- Create: `apps/landing/public/stage/*.webp`, `apps/landing/public/voice/*.mp3`, `apps/landing/public/stage/window.jpg`
- Create: `apps/landing/vitest.config.ts`, `apps/landing/tests/pieces.test.ts`
- Modify: `vitest.config.ts` (root), `apps/landing/package.json` (devDependency `vitest` is hoisted; add `"test": "vitest run"`)

**Interfaces:**
- Produces: `PIECES: Record<PieceName, { file: string; width: number; height: number }>`, `type PieceName`, `pieceSrc(name: PieceName): string` returning `/stage/<file>`.

- [ ] **Step 1: Write the bake script**

`apps/landing/scripts/pieces.mjs` runs Python (PIL is on this machine) to trim each cutout to its alpha bounding box with 8 px of margin, save WebP, and write `pieces.ts`:

```js
// Bakes the generated cutouts into public/stage and writes src/stage/pieces.ts
// with each piece's real trimmed size, so the layout never guesses a number.
// Usage: node scripts/pieces.mjs <dir-with-pngs>
import { execFileSync } from "node:child_process";
import { join } from "node:path";

const source = process.argv[2];
if (!source) { console.error("usage: pieces.mjs <dir>"); process.exit(1); }
const here = import.meta.dirname;
const py = `
import json, os, sys
from PIL import Image
src, out, ts = sys.argv[1], sys.argv[2], sys.argv[3]
pieces = {
 "proscenium": "chrome-proscenium", "footlights": "chrome-footlights", "curtain": "curtain-half",
 "stallTeal": "flat-stall-teal", "stallIndigo": "flat-stall-indigo", "redBuilding": "flat-red-building",
 "goldArch": "flat-gold-arch", "back": "back-of-theatre", "nightFar": "night-far", "nightMid": "night-mid",
 "nightNear": "night-near", "slip": "prop-slip", "lamp": "prop-lamp",
 "saathi": "F-minimal-geometric", "shopper": "cast-shopper", "shopkeeper": "cast-shopkeeper", "tout": "cast-tout",
}
os.makedirs(out, exist_ok=True)
rows = []
for name, stem in pieces.items():
    im = Image.open(os.path.join(src, stem + ".png")).convert("RGBA")
    box = im.getchannel("A").getbbox() or (0, 0, im.width, im.height)
    pad = 8
    box = (max(0, box[0]-pad), max(0, box[1]-pad), min(im.width, box[2]+pad), min(im.height, box[3]+pad))
    if name != "back": im = im.crop(box)
    if name == "back": im = im.convert("RGB")
    im.save(os.path.join(out, name + ".webp"), quality=86, method=6)
    rows.append((name, im.width, im.height))
lines = ["/* Generated by scripts/pieces.mjs from the baked cutouts. Do not edit. */",
         "export interface Piece {", "  readonly file: string;", "  readonly width: number;", "  readonly height: number;", "}", "",
         "export const PIECES = {"]
for name, w, h in rows:
    lines.append(f'  {name}: {{ file: "{name}.webp", width: {w}, height: {h} }},')
lines += ["} as const satisfies Record<string, Piece>;", "", "export type PieceName = keyof typeof PIECES;", "",
          "export function pieceSrc(name: PieceName): string {", "  return `/stage/${PIECES[name].file}`;", "}", ""]
open(ts, "w", encoding="utf-8").write("\\n".join(lines))
print(json.dumps(rows))
`;
const out = join(here, "..", "public", "stage");
const ts = join(here, "..", "src", "stage", "pieces.ts");
const result = execFileSync("python", ["-c", py, source, out, ts], { encoding: "utf8" });
console.log("pieces:", result.trim());
```

- [ ] **Step 2: Run it against the scratchpad art directory, convert the voices, capture the window**

Run:
```bash
cd C:/Users/coehe/Razorpay/covenant/apps/landing
node scripts/pieces.mjs "C:/Users/coehe/AppData/Local/Temp/claude/C--Users-coehe-Razorpay/7a30a1c0-4fab-42ab-a65f-e3e3e9e49154/scratchpad/art"
mkdir -p public/voice public/audio
cp "C:/Users/coehe/AppData/Local/Temp/claude/C--Users-coehe-Razorpay/7a30a1c0-4fab-42ab-a65f-e3e3e9e49154/scratchpad/voice/mp3/"*.mp3 public/voice/
```
Expected: 17 WebP files in `public/stage`, `src/stage/pieces.ts` written with 17 entries, 10 MP3s in `public/voice`.

The window screenshot: with the product running on :5173, open the Browser pane at `http://localhost:5173`, continue as the demo user, start an errand that opens the sandbox window, and screenshot the window region at 1280 wide; save it as `apps/landing/public/stage/window.jpg` (JPEG, quality 82, under 200 KB). If the live window is not available in the session, use a screenshot of the demo storefront at `packages/browser-drive/fixtures/shop/` loaded in the pane instead; never a mockup.

- [ ] **Step 3: Write the failing test**

`apps/landing/tests/pieces.test.ts`:
```ts
import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PIECES, pieceSrc } from "../src/stage/pieces.ts";

const PUBLIC = join(import.meta.dirname, "..", "public");

describe("the stage pieces", () => {
  it("every piece is a real file with a real size", () => {
    for (const [name, piece] of Object.entries(PIECES)) {
      const path = join(PUBLIC, "stage", piece.file);
      expect(existsSync(path), `${name} missing at ${path}`).toBe(true);
      expect(statSync(path).size).toBeGreaterThan(2_000);
      expect(piece.width).toBeGreaterThan(50);
      expect(piece.height).toBeGreaterThan(50);
    }
  });

  it("resolves to the public stage path", () => {
    expect(pieceSrc("saathi")).toBe("/stage/saathi.webp");
  });

  it("no piece is heavier than the page can afford", () => {
    for (const piece of Object.values(PIECES)) {
      expect(statSync(join(PUBLIC, "stage", piece.file)).size).toBeLessThan(420_000);
    }
  });
});
```

- [ ] **Step 4: Wire vitest for the landing app**

`apps/landing/vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "landing",
    include: ["tests/**/*.test.ts"],
    environment: "node",
  },
});
```
Root `vitest.config.ts`: change `const apps = ["gateway-svc", "audit-ui", "merchant-ui", "agent-host"];` to include `"landing"`.
`apps/landing/package.json` scripts: add `"test": "vitest run"`.

- [ ] **Step 5: Run the test**

Run: `cd C:/Users/coehe/Razorpay/covenant && npx vitest run --project landing`
Expected: 3 passed.

- [ ] **Step 6: Gates and commit**

Run the four gates. Then:
```bash
git add apps/landing/scripts/pieces.mjs apps/landing/src/stage/pieces.ts apps/landing/public/stage apps/landing/public/voice apps/landing/vitest.config.ts apps/landing/tests/pieces.test.ts apps/landing/package.json vitest.config.ts
git commit -m "feat(landing): bake the katputli cast, stage pieces and voice lines"
```

---

### Task 2: The Theatre, and the curtain going up

**Files:**
- Create: `apps/landing/src/stage/scenes.ts`, `Theatre.tsx`, `Theatre.module.css`, `Curtain.tsx`, `Cast.tsx`, `Cast.module.css`
- Create: `apps/landing/src/acts/Act.tsx`, `Act.module.css`, `copy.ts`, `Hero.tsx`, `Hero.module.css`
- Create: `apps/landing/src/Show.tsx`
- Create: `apps/landing/tests/scenes.test.ts`, `apps/landing/tests/copy.test.ts`
- Modify: `apps/landing/src/App.tsx`, `apps/landing/src/App.module.css`, `apps/landing/src/styles/base.css`, `.claude/launch.json`

**Interfaces:**
- Produces: `type ActName = "curtain" | "word" | "walk" | "refusal" | "bill" | "call"`; `interface Scene { variant: "day" | "night"; flats: readonly FlatPlacement[] }`; `SCENES: Record<ActName, Scene>`; `<Theatre scene cast overlay? side? stageRef? className?>`; `<Cast name x w i? beat? onClick? label? down? stickRef?>`; `<Act id name eyebrow title stage>children</Act>`; `COPY` in `copy.ts`.

- [ ] **Step 1: Scenes data**

`apps/landing/src/stage/scenes.ts`:
```ts
import type { PieceName } from "./pieces.ts";

export type ActName = "curtain" | "word" | "walk" | "refusal" | "bill" | "call";
/** 0 is the back wall's neighbour, 2 stands just behind the cast. */
export type Depth = 0 | 1 | 2;

export interface FlatPlacement {
  readonly piece: PieceName;
  /** Centre, as a percentage of the stage width. */
  readonly x: number;
  /** Width, as a percentage of the stage width. */
  readonly w: number;
  readonly depth: Depth;
}

export interface Scene {
  readonly variant: "day" | "night";
  readonly flats: readonly FlatPlacement[];
}

const day = (flats: readonly FlatPlacement[]): Scene => ({ variant: "day", flats });

export const SCENES: Record<ActName, Scene> = {
  curtain: day([
    { piece: "goldArch", x: 50, w: 30, depth: 0 },
    { piece: "stallTeal", x: 20, w: 27, depth: 1 },
    { piece: "stallIndigo", x: 80, w: 27, depth: 1 },
  ]),
  word: day([
    { piece: "redBuilding", x: 74, w: 24, depth: 0 },
    { piece: "stallTeal", x: 22, w: 28, depth: 1 },
  ]),
  walk: day([
    { piece: "goldArch", x: 48, w: 26, depth: 0 },
    { piece: "redBuilding", x: 14, w: 22, depth: 0 },
    { piece: "stallIndigo", x: 78, w: 28, depth: 1 },
    { piece: "stallTeal", x: 26, w: 26, depth: 2 },
  ]),
  refusal: day([
    { piece: "redBuilding", x: 22, w: 24, depth: 0 },
    { piece: "stallIndigo", x: 74, w: 28, depth: 1 },
  ]),
  bill: {
    variant: "night",
    flats: [
      { piece: "nightFar", x: 50, w: 100, depth: 0 },
      { piece: "nightMid", x: 50, w: 100, depth: 1 },
      { piece: "nightNear", x: 50, w: 100, depth: 2 },
    ],
  },
  call: day([{ piece: "goldArch", x: 50, w: 30, depth: 0 }]),
};
```

- [ ] **Step 2: Failing tests for scenes and copy**

`apps/landing/tests/scenes.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { PIECES } from "../src/stage/pieces.ts";
import { SCENES } from "../src/stage/scenes.ts";

describe("scenes", () => {
  it("place only pieces that exist, inside the stage", () => {
    for (const [act, scene] of Object.entries(SCENES)) {
      for (const flat of scene.flats) {
        expect(flat.piece in PIECES, `${act}: ${flat.piece}`).toBe(true);
        expect(flat.x).toBeGreaterThanOrEqual(0);
        expect(flat.x).toBeLessThanOrEqual(100);
        expect(flat.w).toBeGreaterThan(0);
        expect(flat.w).toBeLessThanOrEqual(100);
      }
    }
  });

  it("the bill is the one night", () => {
    const nights = Object.entries(SCENES).filter(([, s]) => s.variant === "night");
    expect(nights.map(([name]) => name)).toEqual(["bill"]);
  });
});
```

`apps/landing/tests/copy.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { COPY } from "../src/acts/copy.ts";

function strings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(strings);
  if (value && typeof value === "object") return Object.values(value).flatMap(strings);
  return [];
}

describe("the copy", () => {
  const all = strings(COPY);
  it("has no em dashes", () => {
    for (const line of all) expect(line, line).not.toContain("\u2014");
  });
  it("uses none of our own vocabulary on a shopper", () => {
    for (const line of all) {
      expect(line.toLowerCase(), line).not.toMatch(/covenant|mandate|ledger|ap2|sandbox|sku/);
    }
  });
});
```

Run: `npx vitest run --project landing`
Expected: FAIL, `copy.ts` and `scenes.ts` not found (scenes passes once Step 1 is in; copy fails until Step 3).

- [ ] **Step 3: The copy**

`apps/landing/src/acts/copy.ts`:
```ts
/** Every line a shopper reads, in one place, tested for the house rules. */
export const COPY = {
  hero: {
    line: "Every agent dances for someone.",
    turn: "This one dances for you.",
    demo: "watch the demo",
    build: "see how it is built",
  },
  word: {
    eyebrow: "Act one",
    title: "Your word.",
    body: "You say it once, in your words. It is written down exactly like that, and nothing outside it can happen.",
    slip: ["Navy kurta.", "Under two thousand.", "Returnable, if it can be."],
    seal: "press and hold to give your word",
    sealed: "your word, given",
    stamp: "given",
  },
  walk: {
    eyebrow: "Act two",
    title: "The walk.",
    body: "Saathi walks the shops in a window you can watch. Every page it reads and every button it presses, you see. The stick is yours whenever you want it.",
    turn: "turn the stage around",
    back: "turn it back",
    window: "the window, as you see it",
  },
  refusal: {
    eyebrow: "Act three",
    title: "The refusal.",
    body: "Only two left. Add a protection plan. Just take it. Every shop has someone like him, and every one of them is refused at the door.",
    count: (n: number): string => `asked ${n} times, refused ${n} times, it does not tire.`,
    again: "make him try again",
    stamp: "refused",
  },
  bill: {
    eyebrow: "Act four",
    title: "The bill.",
    body: "Nothing is bought until you press and hold, and every rupee lands where you can read it.",
    others: [
      ["Rs 18,999", "headphones", "no one asked"],
      ["Rs 1,29,000", "laptop", "no one asked"],
      ["Rs 42,350", "flights", "no one asked"],
    ],
    yours: ["Rs 1,850", "navy kurta", "you pressed and held"],
    close: "Sab theek hai.",
  },
  call: {
    eyebrow: "Curtain call",
    title: "The cast.",
    body: "Saathi, the shopper, the shopkeeper, and the one who was refused.",
  },
  sound: { on: "sound on", off: "sound off", label: "Toggle the show's sound" },
} as const;
```

- [ ] **Step 4: The Theatre**

`apps/landing/src/stage/Theatre.tsx`:
```tsx
import type { JSX, ReactNode, RefObject } from "react";
import { PIECES, pieceSrc } from "./pieces.ts";
import type { FlatPlacement, Scene } from "./scenes.ts";
import { Curtain } from "./Curtain.tsx";
import styles from "./Theatre.module.css";

type TheatreProps = {
  scene: Scene;
  /** Puppets, rendered inside the cast plane. */
  cast: ReactNode;
  /** Props and paper laid over the scene, in front of the cast. */
  overlay?: ReactNode;
  /** What the back of the theatre shows when it is turned around. */
  back?: ReactNode;
  side?: "front" | "back";
  curtain?: boolean;
  stageRef?: RefObject<HTMLDivElement>;
  className?: string;
};

function Flat({ flat }: { flat: FlatPlacement }): JSX.Element {
  const piece = PIECES[flat.piece];
  return (
    <img
      className={styles.flat}
      src={pieceSrc(flat.piece)}
      alt=""
      width={piece.width}
      height={piece.height}
      style={{ "--x": `${flat.x}%`, "--w": flat.w } as never}
      loading="lazy"
      decoding="async"
    />
  );
}

/*
 * DECISION: one theatre, rendered once per act. A single sticky stage would
 * need JavaScript to change scenes, and the page must read settled with
 * JavaScript off; five theatres cost one cached image set and give every act
 * its own scroll-driven parallax for free.
 */
export function Theatre(props: TheatreProps): JSX.Element {
  const { scene, cast, overlay, back, side = "front", curtain = false } = props;
  const depths = [0, 1, 2] as const;
  const cls = [styles.theatre, scene.variant === "night" ? styles.night : "", props.className ?? ""].join(" ");
  return (
    <div className={cls} data-side={side} ref={props.stageRef}>
      <div className={styles.box}>
        <div className={styles.front}>
          <div className={styles.wall} />
          {depths.map((depth) => (
            <div key={depth} className={styles.plane} data-depth={depth}>
              {scene.flats.filter((f) => f.depth === depth).map((f) => <Flat key={f.piece + f.x} flat={f} />)}
            </div>
          ))}
          <div className={styles.plane} data-depth="3">{cast}</div>
          {overlay}
          <img className={styles.footlights} src={pieceSrc("footlights")} alt="" width={PIECES.footlights.width} height={PIECES.footlights.height} />
          {curtain ? <Curtain /> : null}
          <img className={styles.proscenium} src={pieceSrc("proscenium")} alt="" width={PIECES.proscenium.width} height={PIECES.proscenium.height} />
        </div>
        {back !== undefined ? <div className={styles.back}>{back}</div> : null}
      </div>
    </div>
  );
}
```

`apps/landing/src/stage/Curtain.tsx`:
```tsx
import type { JSX } from "react";
import { PIECES, pieceSrc } from "./pieces.ts";
import styles from "./Theatre.module.css";

/** Two halves of one cut-paper curtain. Closed only while JavaScript is
 *  about to open it; settled open everywhere else. */
export function Curtain(): JSX.Element {
  const piece = PIECES.curtain;
  return (
    <>
      <img className={`${styles.curtain} ${styles.curtainLeft}`} src={pieceSrc("curtain")} alt="" width={piece.width} height={piece.height} />
      <img className={`${styles.curtain} ${styles.curtainRight}`} src={pieceSrc("curtain")} alt="" width={piece.width} height={piece.height} />
    </>
  );
}
```

`apps/landing/src/stage/Theatre.module.css`:
```css
.theatre {
  --px: 0;
  --py: 0;
  position: relative;
  width: 100%;
  aspect-ratio: 3 / 2;
  perspective: 1800px;
  container-type: inline-size;
}
.box {
  position: absolute;
  inset: 0;
  transform-style: preserve-3d;
  transition: transform 1.1s var(--ease-out);
}
.theatre[data-side="back"] .box { transform: rotateY(180deg); }
.front, .back {
  position: absolute;
  inset: 0;
  overflow: hidden;
  backface-visibility: hidden;
}
.back { transform: rotateY(180deg); background: #cdb894; }

/* The back wall is kraft by day and a backlit paper sky by night. */
.wall { position: absolute; inset: 0; background: #e8dcc3; }
.night .wall {
  background: radial-gradient(ellipse 70% 60% at 50% 66%, #f3b25a 0%, #d9722a 26%, #6b2f6a 58%, #1d1540 100%);
}

/* Four planes. Depth is parallax and scale, never blur: the pointer tilt
   moves each plane by its own amount, and the scroll timeline drifts the
   far ones as the stage passes through the viewport. */
.plane {
  position: absolute;
  inset: 0;
  transform: translate(calc(var(--px) * var(--para)), calc(var(--py) * var(--para) * 0.4));
  transition: transform 0.3s var(--ease-out);
}
.plane[data-depth="0"] { --para: 5px; }
.plane[data-depth="1"] { --para: 11px; }
.plane[data-depth="2"] { --para: 18px; }
.plane[data-depth="3"] { --para: 28px; }

.flat {
  position: absolute;
  bottom: 13%;
  left: var(--x);
  width: calc(var(--w) * 1%);
  height: auto;
  transform: translateX(-50%);
}
.plane[data-depth="0"] .flat { bottom: 22%; }
.plane[data-depth="1"] .flat { bottom: 17%; }
.night .flat { bottom: 0; width: 100%; }

.footlights {
  position: absolute;
  left: 3%;
  right: 3%;
  bottom: 3.5%;
  width: 94%;
  height: auto;
  pointer-events: none;
}
.proscenium {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}

.curtain {
  position: absolute;
  top: 6%;
  height: 90%;
  width: auto;
  pointer-events: none;
  transition: transform 1.4s cubic-bezier(0.2, 0.8, 0.2, 1);
}
.curtainLeft { left: 4%; transform-origin: left top; }
.curtainRight { right: 4%; transform: scaleX(-1); transform-origin: right top; }
/* Closed only when JavaScript will open it; the no-JS page and reduced
   motion see the show settled. The opening is a one-shot animation so the
   curtain does not need an observer. */
@media (prefers-reduced-motion: no-preference) {
  html[data-js] .curtainLeft { animation: openLeft 1.5s cubic-bezier(0.2, 0.8, 0.2, 1) 0.5s both; }
  html[data-js] .curtainRight { animation: openRight 1.5s cubic-bezier(0.2, 0.8, 0.2, 1) 0.5s both; }
}
@keyframes openLeft { from { transform: translateX(78%) scaleX(1.6); } to { transform: translateX(0) scaleX(1); } }
@keyframes openRight { from { transform: translateX(-78%) scaleX(-1.6); } to { transform: translateX(0) scaleX(-1); } }

/* Scroll-driven drift, compositor only, behind a support gate. */
@supports (animation-timeline: view()) {
  @media (prefers-reduced-motion: no-preference) {
    .plane[data-depth="0"] { animation: driftFar linear both; animation-timeline: view(); }
    .plane[data-depth="1"] { animation: driftMid linear both; animation-timeline: view(); }
  }
}
@keyframes driftFar { from { translate: -2% 1.5%; } to { translate: 2% -1.5%; } }
@keyframes driftMid { from { translate: -1% 0.8%; } to { translate: 1% -0.8%; } }
```

- [ ] **Step 5: The Cast wrapper**

`apps/landing/src/stage/Cast.tsx`:
```tsx
import type { JSX, RefObject } from "react";
import { PIECES, pieceSrc } from "./pieces.ts";
import styles from "./Cast.module.css";

export type CastName = "saathi" | "shopper" | "shopkeeper" | "tout";

type CastProps = {
  name: CastName;
  /** Centre, as a percentage of the stage width. */
  x: number;
  /** Width, as a percentage of the stage width. */
  w?: number;
  /** Entrance stagger step. */
  i?: number;
  /** Which voice line this entrance speaks, if the sound is on. */
  beat?: string;
  /** Dropped out of frame (the tout between tries). */
  down?: boolean;
  bow?: boolean;
  onClick?: () => void;
  label?: string;
  stickRef?: RefObject<HTMLDivElement>;
};

/*
 * A rod puppet on the stage: the wrapper is where it stands and is what
 * the one IntersectionObserver watches; the inner piece is what rises over
 * the footlights (base.css [data-pop]); the figure inside rocks about the
 * base of its stick. Three elements because three different transforms
 * must not fight over one.
 */
export function Cast(props: CastProps): JSX.Element {
  const { name, x, w = 17, i = 0, beat, down = false, bow = false, onClick, label, stickRef } = props;
  const piece = PIECES[name];
  const figure = (
    <img className={styles.figure} src={pieceSrc(name)} alt={label ?? ""} width={piece.width} height={piece.height} decoding="async" />
  );
  return (
    <div
      ref={stickRef}
      className={`${styles.cast} ${bow ? styles.bow : ""}`}
      data-s
      data-pop
      data-beat={beat}
      data-down={down ? "" : undefined}
      style={{ "--x": `${x}%`, "--w": w, "--i": i } as never}
    >
      {onClick ? (
        <button type="button" className={styles.puppet} onClick={onClick} aria-label={label}>{figure}</button>
      ) : (
        <div className={styles.puppet}>{figure}</div>
      )}
    </div>
  );
}
```

`apps/landing/src/stage/Cast.module.css`:
```css
.cast {
  position: absolute;
  bottom: 5%;
  left: var(--x);
  width: calc(var(--w) * 1%);
  transform: translateX(calc(-50% + var(--dx, 0px)));
}
.puppet { display: block; width: 100%; padding: 0; }
.figure {
  display: block;
  width: 100%;
  height: auto;
  transform: rotate(var(--stick-rot, 0deg));
  transform-origin: 50% 100%;
}
button.puppet { cursor: pointer; }
button.puppet:focus-visible { outline: 2px solid var(--indigo); outline-offset: 6px; }

/* The bow: a nod from the base of the stick, once, after the entrance. */
@media (prefers-reduced-motion: no-preference) {
  html[data-js] .bow.in .figure {
    animation: bow 1.2s var(--ease-out) both;
    animation-delay: calc(var(--i, 0) * 170ms + 1.1s);
  }
}
@keyframes bow {
  0% { transform: rotate(0deg); }
  45% { transform: rotate(-11deg); }
  100% { transform: rotate(0deg); }
}
```

Add to `apps/landing/src/styles/base.css`, inside the `prefers-reduced-motion: no-preference` block after the `[data-pop].in > *` rule:
```css
  /* A puppet that has been pulled down between tries drops out of frame
     fast; the rise back up keeps the entrance's overshoot. */
  html[data-js] [data-s][data-pop].in[data-down] > * {
    transform: translateY(118%);
    transition: transform 0.4s var(--ease-snap);
    transition-delay: 0s;
  }
```

- [ ] **Step 6: The Act shell and the Hero**

`apps/landing/src/acts/Act.tsx`:
```tsx
import type { JSX, ReactNode } from "react";
import type { ActName } from "../stage/scenes.ts";
import styles from "./Act.module.css";

type ActProps = {
  id: string;
  name: ActName;
  eyebrow: string;
  title: string;
  stage: ReactNode;
  children: ReactNode;
};

/** One curtain of the show: the stage, and the words beside it. */
export function Act({ id, name, eyebrow, title, stage, children }: ActProps): JSX.Element {
  return (
    <section id={id} className={styles.act} data-act={name}>
      <div className={styles.stage}>{stage}</div>
      <div className={styles.copy} data-s>
        <p className="label">{eyebrow}</p>
        <h2 className={styles.title}>{title}</h2>
        {children}
      </div>
    </section>
  );
}
```

`apps/landing/src/acts/Act.module.css`:
```css
.act {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--sp-9);
  align-items: end;
  max-width: var(--page-max);
  margin: 0 auto;
  padding: var(--sp-13) var(--page-pad);
}
@media (min-width: 1024px) {
  .act { grid-template-columns: minmax(0, 7fr) minmax(280px, 3fr); gap: var(--sp-11); }
  .act:nth-of-type(even) .copy { order: -1; }
}
.stage { min-width: 0; }
.copy { display: grid; gap: var(--sp-6); max-width: 40ch; }
.title {
  font-family: var(--font-display);
  font-variation-settings: "opsz" 96, "wght" 400;
  font-size: var(--t-display-l);
  line-height: 1.1;
  letter-spacing: -0.01em;
  text-wrap: balance;
}
.copy p { font-size: var(--t-body-l); line-height: var(--t-body-l-line); color: var(--ink-70); }
.copy p.label { color: var(--ink-55); }
```

`apps/landing/src/acts/Hero.tsx`:
```tsx
import { useRef, type JSX } from "react";
import { Wordmark } from "../chrome/Wordmark.tsx";
import { BUILD_URL, DEMO_URL } from "../content/links.ts";
import { usePointerStick } from "../motion/usePointerStick.ts";
import { useTilt } from "../motion/useTilt.ts";
import { Cast } from "../stage/Cast.tsx";
import { SCENES } from "../stage/scenes.ts";
import { Theatre } from "../stage/Theatre.tsx";
import { COPY } from "./copy.ts";
import styles from "./Hero.module.css";

/*
 * Curtain up. The name arrives behind the curtain (Wordmark's own delay
 * hook), Saathi rises centre stage, and the stick is in the visitor's hand
 * from the first second: this is the one stage where the puppet follows
 * the pointer.
 */
export function Hero(): JSX.Element {
  const stage = useRef<HTMLDivElement>(null);
  const stick = useRef<HTMLDivElement>(null);
  useTilt(stage);
  usePointerStick(stage, stick, 50);
  return (
    <header id="top" className={styles.hero}>
      <Theatre
        scene={SCENES.curtain}
        curtain
        stageRef={stage}
        overlay={
          <h1 className={styles.name} style={{ "--wordmark-delay": "1500ms" } as never}>
            <Wordmark mode="hero" />
          </h1>
        }
        cast={<Cast name="saathi" x={50} w={17} beat="curtain" stickRef={stick} label="Saathi" />}
      />
      <div className={styles.lines} data-s style={{ "--i": 4 } as never}>
        <p className={styles.line}>{COPY.hero.line}</p>
        <p className={styles.turn}>{COPY.hero.turn}</p>
        <p className={styles.doors}>
          <a href={DEMO_URL}>{COPY.hero.demo}</a>
          <a href={BUILD_URL}>{COPY.hero.build}</a>
        </p>
      </div>
    </header>
  );
}
```

`apps/landing/src/acts/Hero.module.css`:
```css
.hero {
  max-width: var(--page-max);
  margin: 0 auto;
  padding: var(--sp-10) var(--page-pad) var(--sp-12);
  display: grid;
  gap: var(--sp-9);
}
.name {
  position: absolute;
  top: 24%;
  left: 0;
  right: 0;
  text-align: center;
  font-size: clamp(56px, 9cqw, 150px);
  line-height: 0.94;
  pointer-events: none;
}
.lines { display: grid; gap: var(--sp-4); justify-items: center; text-align: center; }
.line {
  font-family: var(--font-display);
  font-variation-settings: "opsz" 144, "wght" 300;
  font-size: var(--t-statement);
  line-height: 1.05;
  letter-spacing: -0.015em;
  text-wrap: balance;
}
.turn { font-size: var(--t-body-l); line-height: var(--t-body-l-line); color: var(--ink-70); }
.doors { display: flex; gap: var(--sp-8); margin-top: var(--sp-4); }
.doors a {
  font-family: var(--font-data);
  font-size: var(--t-label);
  letter-spacing: var(--t-label-tracking);
  text-transform: uppercase;
  color: var(--indigo);
}
```

For this task, `usePointerStick` and `useTilt` are stubs that do nothing (Task 3 fills them):
`apps/landing/src/motion/useTilt.ts`:
```ts
import type { RefObject } from "react";
export function useTilt(_stage: RefObject<HTMLElement>): void {
  void _stage;
}
```
`apps/landing/src/motion/usePointerStick.ts`:
```ts
import type { RefObject } from "react";
export function usePointerStick(_stage: RefObject<HTMLElement>, _stick: RefObject<HTMLElement>, _restX: number): void {
  void _stage; void _stick; void _restX;
}
```

- [ ] **Step 7: Show and App**

`apps/landing/src/Show.tsx`:
```tsx
import type { JSX } from "react";
import { Hero } from "./acts/Hero.tsx";
import { useInView } from "./motion/useInView.ts";
import { Footer } from "./sections/Footer.tsx";

/** The whole show, top to curtain call. Acts are added one per task. */
export function Show(): JSX.Element {
  useInView();
  return (
    <>
      <Hero />
      <Footer />
    </>
  );
}
```

`apps/landing/src/App.tsx`:
```tsx
import type { JSX } from "react";
import { Show } from "./Show.tsx";
import styles from "./App.module.css";

export function App(): JSX.Element {
  return (
    <div className={styles.page}>
      <Show />
    </div>
  );
}
```
`App.module.css` keeps only `.page`.

`.claude/launch.json`:
```json
{
  "version": "0.0.1",
  "configurations": [
    { "name": "landing", "runtimeExecutable": "npx", "runtimeArgs": ["vite", "--port", "5199"], "cwd": "apps/landing", "port": 5199 }
  ]
}
```
(If `cwd` is not honoured, use `runtimeExecutable: "pnpm"`, `runtimeArgs: ["--filter", "@covenant/landing", "dev"]`.)

- [ ] **Step 8: Run tests, then look**

Run: `npx vitest run --project landing` → 3 files pass.
Open the Browser pane on `landing`, screenshot at desktop and at the mobile preset. Expected: the theatre with the curtain opening, the wordmark arriving behind it, Saathi rising centre stage over the footlights, the two lines and two doors under the stage; flats standing at three depths inside the proscenium; no horizontal scroll on mobile.

- [ ] **Step 9: Gates and commit**

```bash
git add apps/landing/src apps/landing/tests .claude/launch.json
git commit -m "feat(landing): the theatre and the curtain going up"
```

---

### Task 3: The stick in the visitor's hand

**Files:**
- Create: `apps/landing/src/motion/stickSpring.ts`, `apps/landing/tests/stickSpring.test.ts`
- Modify: `apps/landing/src/motion/usePointerStick.ts`, `apps/landing/src/motion/useTilt.ts`

**Interfaces:**
- Produces: `interface Spring { x: number; v: number }`, `step(s, target, dtMs): Spring`, `settled(s, target): boolean`, `tilt(v): number`.

- [ ] **Step 1: Failing test**

`apps/landing/tests/stickSpring.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { settled, step, tilt, type Spring } from "../src/motion/stickSpring.ts";

function run(from: number, to: number, frames: number, dt = 16): Spring[] {
  const out: Spring[] = [];
  let s: Spring = { x: from, v: 0 };
  for (let i = 0; i < frames; i += 1) { s = step(s, to, dt); out.push(s); }
  return out;
}

describe("the stick spring", () => {
  it("arrives and settles within a second and a half", () => {
    const path = run(20, 70, 90);
    expect(settled(path[path.length - 1]!, 70)).toBe(true);
  });

  it("overshoots once, like a hand stopping a stick, not more", () => {
    const path = run(20, 70, 120);
    let crossings = 0;
    let above = false;
    for (const s of path) {
      const nowAbove = s.x > 70;
      if (nowAbove !== above) { crossings += 1; above = nowAbove; }
    }
    expect(crossings).toBeGreaterThanOrEqual(1);
    expect(crossings).toBeLessThanOrEqual(2);
  });

  it("never diverges on a frame that took too long", () => {
    let s: Spring = { x: 0, v: 0 };
    for (let i = 0; i < 40; i += 1) s = step(s, 90, 900);
    expect(Math.abs(s.x)).toBeLessThan(200);
    expect(Number.isFinite(s.v)).toBe(true);
  });

  it("tilts with velocity and never past nine degrees", () => {
    expect(tilt(0)).toBe(0);
    expect(tilt(40)).toBeGreaterThan(0);
    expect(tilt(4000)).toBe(9);
    expect(tilt(-4000)).toBe(-9);
  });
});
```

Run: `npx vitest run --project landing` → FAIL, module not found.

- [ ] **Step 2: The spring**

`apps/landing/src/motion/stickSpring.ts`:
```ts
/** A rod puppet followed by a hand: position and velocity in percent of
 *  the stage width and percent per second. */
export interface Spring {
  readonly x: number;
  readonly v: number;
}

/* Underdamped on purpose (damping ratio about 0.64): the puppet passes the
   hand once and comes back, which is what a stick held from below does. A
   frame longer than 48 ms is treated as 48 ms so a tab returning from the
   background cannot fling the puppet off the stage. */
const STIFFNESS = 120;
const DAMPING = 14;
const MAX_STEP_MS = 48;

export function step(s: Spring, target: number, dtMs: number): Spring {
  const dt = Math.min(Math.max(dtMs, 0), MAX_STEP_MS) / 1000;
  const a = STIFFNESS * (target - s.x) - DAMPING * s.v;
  const v = s.v + a * dt;
  return { x: s.x + v * dt, v };
}

export function settled(s: Spring, target: number): boolean {
  return Math.abs(target - s.x) < 0.05 && Math.abs(s.v) < 0.5;
}

/** Degrees of lean, from velocity, capped so the figure never falls over. */
export function tilt(v: number): number {
  return Math.max(-9, Math.min(9, v * 0.12));
}
```

Run: `npx vitest run --project landing` → 4 stick tests pass.

- [ ] **Step 3: The hooks**

`apps/landing/src/motion/usePointerStick.ts`:
```ts
import { useEffect, type RefObject } from "react";
import { prefersReducedMotion } from "./reduced.ts";
import { settled, step, tilt, type Spring } from "./stickSpring.ts";

/*
 * The visitor holds the stick. A pointer over the stage sets where the hand
 * is; the puppet follows on the spring and rocks with its own velocity. The
 * loop runs only while the spring is unsettled, writes two CSS variables and
 * reads the DOM once per pointer entry, so there is no read/write sweep.
 */
export function usePointerStick(stage: RefObject<HTMLElement>, stick: RefObject<HTMLElement>, restX: number): void {
  useEffect(() => {
    const el = stage.current;
    const puppet = stick.current;
    if (el === null || puppet === null || prefersReducedMotion()) return;
    let rect = el.getBoundingClientRect();
    let target = restX;
    let s: Spring = { x: restX, v: 0 };
    let frame = 0;
    let last = 0;

    const paint = (now: number): void => {
      s = step(s, target, last === 0 ? 16 : now - last);
      last = now;
      puppet.style.setProperty("--dx", `${((s.x - restX) / 100) * rect.width}px`);
      puppet.style.setProperty("--stick-rot", `${tilt(s.v)}deg`);
      frame = settled(s, target) ? 0 : requestAnimationFrame(paint);
      if (frame === 0) last = 0;
    };
    const wake = (): void => { if (frame === 0) frame = requestAnimationFrame(paint); };
    const onEnter = (): void => { rect = el.getBoundingClientRect(); };
    const onMove = (e: PointerEvent): void => {
      target = Math.min(92, Math.max(8, ((e.clientX - rect.left) / rect.width) * 100));
      wake();
    };
    const onLeave = (): void => { target = restX; wake(); };

    el.addEventListener("pointerenter", onEnter);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerleave", onLeave);
    return () => {
      el.removeEventListener("pointerenter", onEnter);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerleave", onLeave);
      if (frame !== 0) cancelAnimationFrame(frame);
    };
  }, [stage, stick, restX]);
}
```

`apps/landing/src/motion/useTilt.ts`:
```ts
import { useEffect, type RefObject } from "react";
import { prefersReducedMotion } from "./reduced.ts";

/** The pointer leans the planes: two variables in -1..1, one write per move,
 *  reset on leave. Touch never fires this, and the scroll drift covers it. */
export function useTilt(stage: RefObject<HTMLElement>): void {
  useEffect(() => {
    const el = stage.current;
    if (el === null || prefersReducedMotion()) return;
    let rect = el.getBoundingClientRect();
    const onEnter = (): void => { rect = el.getBoundingClientRect(); };
    const onMove = (e: PointerEvent): void => {
      el.style.setProperty("--px", (((e.clientX - rect.left) / rect.width) * 2 - 1).toFixed(3));
      el.style.setProperty("--py", (((e.clientY - rect.top) / rect.height) * 2 - 1).toFixed(3));
    };
    const onLeave = (): void => { el.style.setProperty("--px", "0"); el.style.setProperty("--py", "0"); };
    el.addEventListener("pointerenter", onEnter);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerleave", onLeave);
    return () => {
      el.removeEventListener("pointerenter", onEnter);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerleave", onLeave);
    };
  }, [stage]);
}
```

- [ ] **Step 4: Look**

In the Browser pane: move the pointer across the hero stage. Expected: Saathi follows with a lag, passes the pointer once and settles, leaning into the move; planes shift slightly against each other; leaving the stage brings the puppet back to centre.

- [ ] **Step 5: Gates and commit**

```bash
git add apps/landing/src/motion apps/landing/tests/stickSpring.test.ts
git commit -m "feat(landing): the stick follows the visitor's hand"
```

---

### Task 4: Sound: the footlight switch and the voices

**Files:**
- Create: `apps/landing/src/sound/lines.ts`, `soundState.ts`, `SoundContext.tsx`, `useShowSound.ts`, `Switch.tsx`, `Switch.module.css`
- Create: `apps/landing/tests/lines.test.ts`, `apps/landing/tests/soundState.test.ts`
- Modify: `apps/landing/src/motion/useInView.ts`, `apps/landing/src/Show.tsx`

**Interfaces:**
- Produces: `type Beat`, `lineFile(beat, n?)`, `LINES`; `SoundState`, `OFF`, `toggled()`, `spoken()`, `shouldSpeak()`; `useSound(): { on: boolean; toggle(): void; speak(beat: Beat, n?: number, again?: boolean): void }`; `useInView(onIn?: (el: HTMLElement) => void)`.

- [ ] **Step 1: Failing tests**

`apps/landing/tests/lines.test.ts`:
```ts
import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { LINES, lineFile } from "../src/sound/lines.ts";

describe("the voice lines", () => {
  it("every beat names files that exist", () => {
    for (const stems of Object.values(LINES)) {
      for (const stem of stems) {
        expect(existsSync(join(import.meta.dirname, "..", "public", "voice", `${stem}.mp3`)), stem).toBe(true);
      }
    }
  });
  it("cycles the tout's tries", () => {
    expect(lineFile("refusal-tout", 0)).toBe("/voice/tout-refusal.mp3");
    expect(lineFile("refusal-tout", 3)).toBe("/voice/tout-refusal.mp3");
    expect(lineFile("refusal-tout", 1)).toBe("/voice/tout-again-1.mp3");
  });
});
```

`apps/landing/tests/soundState.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { OFF, shouldSpeak, spoken, toggled } from "../src/sound/soundState.ts";

describe("the sound switch", () => {
  it("is off until someone turns it on", () => {
    expect(OFF.on).toBe(false);
    expect(shouldSpeak(OFF, "curtain")).toBe(false);
  });
  it("speaks each beat once, and again only when asked", () => {
    const on = toggled(OFF);
    expect(shouldSpeak(on, "curtain")).toBe(true);
    const after = spoken(on, "curtain");
    expect(shouldSpeak(after, "curtain")).toBe(false);
    expect(shouldSpeak(after, "curtain", true)).toBe(true);
  });
  it("forgets nothing when switched off and on", () => {
    const s = toggled(toggled(spoken(toggled(OFF), "bill")));
    expect(shouldSpeak(s, "bill")).toBe(false);
  });
});
```

- [ ] **Step 2: Lines and state**

`apps/landing/src/sound/lines.ts`:
```ts
export type Beat =
  | "curtain" | "word-shopper" | "word-saathi" | "walk-keeper" | "walk-saathi"
  | "refusal-tout" | "refusal-saathi" | "bill";

/** Which recorded line each beat speaks; the tout has three tries. */
export const LINES: Record<Beat, readonly string[]> = {
  "curtain": ["saathi-curtain"],
  "word-shopper": ["shopper-word"],
  "word-saathi": ["saathi-word"],
  "walk-keeper": ["shopkeeper-walk"],
  "walk-saathi": ["saathi-walk"],
  "refusal-tout": ["tout-refusal", "tout-again-1", "tout-again-2"],
  "refusal-saathi": ["saathi-refusal"],
  "bill": ["saathi-bill"],
};

export function lineFile(beat: Beat, n = 0): string {
  const stems = LINES[beat];
  return `/voice/${stems[n % stems.length]}.mp3`;
}

export function isBeat(value: string | undefined): value is Beat {
  return value !== undefined && value in LINES;
}
```

`apps/landing/src/sound/soundState.ts`:
```ts
import type { Beat } from "./lines.ts";

export interface SoundState {
  readonly on: boolean;
  readonly spoken: ReadonlySet<Beat>;
}

export const OFF: SoundState = { on: false, spoken: new Set() };

export function toggled(s: SoundState): SoundState {
  return { on: !s.on, spoken: s.spoken };
}

export function spoken(s: SoundState, beat: Beat): SoundState {
  return { on: s.on, spoken: new Set([...s.spoken, beat]) };
}

/** Once per beat, unless the caller says again (the tout's tries). */
export function shouldSpeak(s: SoundState, beat: Beat, again = false): boolean {
  return s.on && (again || !s.spoken.has(beat));
}
```

Run: `npx vitest run --project landing` → all pass.

- [ ] **Step 3: The hook, context and switch**

`apps/landing/src/sound/useShowSound.ts`:
```ts
import { useCallback, useEffect, useRef, useState } from "react";
import { lineFile, type Beat } from "./lines.ts";
import { OFF, shouldSpeak, spoken, toggled, type SoundState } from "./soundState.ts";

const KEY = "saathi.sound";
const LOOP = "/audio/loop.mp3";

export interface ShowSound {
  readonly on: boolean;
  toggle(): void;
  speak(beat: Beat, n?: number, again?: boolean): void;
}

/* One voice at a time, queued; one loop under it; nothing plays until the
   switch has been clicked, which is also what lets the browser play at all.
   A missing file rejects play() and is dropped without a word. */
export function useShowSound(): ShowSound {
  const [state, setState] = useState<SoundState>(OFF);
  const stateRef = useRef(state);
  const voice = useRef<HTMLAudioElement | null>(null);
  const loop = useRef<HTMLAudioElement | null>(null);
  const queue = useRef<string[]>([]);
  useEffect(() => { stateRef.current = state; }, [state]);

  useEffect(() => {
    try { if (localStorage.getItem(KEY) === "on") setState((s) => (s.on ? s : toggled(s))); } catch { /* private mode */ }
  }, []);

  const playNext = useCallback((): void => {
    const next = queue.current.shift();
    if (next === undefined || voice.current === null) return;
    voice.current.src = next;
    voice.current.play().catch(() => playNext());
  }, []);

  const speak = useCallback((beat: Beat, n = 0, again = false): void => {
    if (!shouldSpeak(stateRef.current, beat, again)) return;
    setState((s) => spoken(s, beat));
    if (voice.current === null) {
      voice.current = new Audio();
      voice.current.addEventListener("ended", playNext);
    }
    queue.current.push(lineFile(beat, n));
    if (voice.current.paused) playNext();
  }, [playNext]);

  const toggle = useCallback((): void => {
    const next = toggled(stateRef.current);
    setState(next);
    try { localStorage.setItem(KEY, next.on ? "on" : "off"); } catch { /* private mode */ }
    if (!next.on) { loop.current?.pause(); voice.current?.pause(); queue.current = []; return; }
    if (loop.current === null) { loop.current = new Audio(LOOP); loop.current.loop = true; loop.current.volume = 0.32; }
    loop.current.play().catch(() => { loop.current = null; });
  }, []);

  return { on: state.on, toggle, speak };
}
```

`apps/landing/src/sound/SoundContext.tsx`:
```tsx
import { createContext, useContext, type JSX, type ReactNode } from "react";
import { useShowSound, type ShowSound } from "./useShowSound.ts";

const silent: ShowSound = { on: false, toggle: () => undefined, speak: () => undefined };
const SoundContext = createContext<ShowSound>(silent);

export function SoundProvider({ children }: { children: ReactNode }): JSX.Element {
  const sound = useShowSound();
  return <SoundContext.Provider value={sound}>{children}</SoundContext.Provider>;
}

export function useSound(): ShowSound {
  return useContext(SoundContext);
}
```

`apps/landing/src/sound/Switch.tsx`:
```tsx
import type { JSX } from "react";
import { COPY } from "../acts/copy.ts";
import { useSound } from "./SoundContext.tsx";
import styles from "./Switch.module.css";

/** A footlight you can switch: fixed at the bottom right, off by default. */
export function Switch(): JSX.Element {
  const { on, toggle } = useSound();
  return (
    <button type="button" className={styles.switch} aria-pressed={on} aria-label={COPY.sound.label} onClick={toggle}>
      <span className={styles.flame} aria-hidden="true" />
      <span className={styles.text}>{on ? COPY.sound.on : COPY.sound.off}</span>
    </button>
  );
}
```

`apps/landing/src/sound/Switch.module.css`:
```css
.switch {
  position: fixed;
  right: var(--sp-8);
  bottom: var(--sp-8);
  z-index: 20;
  display: inline-flex;
  align-items: center;
  gap: var(--sp-4);
  padding: var(--sp-4) var(--sp-6);
  background: #e6d9bf;
  color: var(--ink);
  border: 1px solid var(--ink-24);
  border-radius: var(--r-1);
  box-shadow: 0 2px 0 var(--ink-12);
}
.flame {
  width: 10px;
  height: 14px;
  border-radius: 50% 50% 50% 50% / 60% 60% 40% 40%;
  background: var(--ink-24);
  transition: background var(--d-hover) var(--ease-out), transform var(--d-hover) var(--ease-out);
}
.switch[aria-pressed="true"] .flame { background: var(--marigold); transform: scale(1.15); }
.text {
  font-family: var(--font-data);
  font-size: var(--t-label);
  letter-spacing: var(--t-label-tracking);
  text-transform: uppercase;
}
```

`apps/landing/src/motion/useInView.ts`: add the callback. Replace the signature with `export function useInView(onIn?: (el: HTMLElement) => void): void`, keep the reduced-motion branch as is (no callbacks there), and inside the observer callback after `e.target.classList.add("in")` add `if (onIn && e.target instanceof HTMLElement && e.target.dataset.beat) onIn(e.target);`. Add `onIn` to the effect's dependency array.

`apps/landing/src/Show.tsx` becomes:
```tsx
import { useCallback, type JSX } from "react";
import { Hero } from "./acts/Hero.tsx";
import { useInView } from "./motion/useInView.ts";
import { Footer } from "./sections/Footer.tsx";
import { isBeat } from "./sound/lines.ts";
import { SoundProvider, useSound } from "./sound/SoundContext.tsx";
import { Switch } from "./sound/Switch.tsx";

function Acts(): JSX.Element {
  const { speak } = useSound();
  const onIn = useCallback((el: HTMLElement): void => {
    const beat = el.dataset.beat;
    if (isBeat(beat)) speak(beat);
  }, [speak]);
  useInView(onIn);
  return (
    <>
      <Hero />
      <Footer />
      <Switch />
    </>
  );
}

export function Show(): JSX.Element {
  return (
    <SoundProvider>
      <Acts />
    </SoundProvider>
  );
}
```

- [ ] **Step 4: Look and listen**

Browser pane: click the switch; expected `aria-pressed="true"`, the flame turns marigold; the loop plays if `/audio/loop.mp3` exists, otherwise nothing and no console error beyond a 404 for the loop. Reload the page: with the switch remembered on, scrolling the hero into view speaks Saathi's curtain line once (check `read_console_messages` shows no errors and the network log shows `/voice/saathi-curtain.mp3` requested once).

- [ ] **Step 5: Gates and commit**

```bash
git add apps/landing/src/sound apps/landing/src/motion/useInView.ts apps/landing/src/Show.tsx apps/landing/tests/lines.test.ts apps/landing/tests/soundState.test.ts
git commit -m "feat(landing): the footlight switch, and the puppets speak"
```

---

### Task 5: Act one, Your word

**Files:**
- Create: `apps/landing/src/acts/Word.tsx`, `Word.module.css`
- Modify: `apps/landing/src/Show.tsx` (add `<Word />` after `<Hero />`)

**Interfaces:**
- Consumes: `Act`, `Theatre`, `Cast`, `SCENES.word`, `Seal` (`label`, `doneLabel`, `onComplete`), `useSound().speak`, `COPY.word`, `pieceSrc("slip")`.

- [ ] **Step 1: The act**

`apps/landing/src/acts/Word.tsx`:
```tsx
import { useRef, useState, type JSX } from "react";
import { Seal } from "../kolam/Seal.tsx";
import { useTilt } from "../motion/useTilt.ts";
import { useSound } from "../sound/SoundContext.tsx";
import { Cast } from "../stage/Cast.tsx";
import { PIECES, pieceSrc } from "../stage/pieces.ts";
import { SCENES } from "../stage/scenes.ts";
import { Theatre } from "../stage/Theatre.tsx";
import { Act } from "./Act.tsx";
import { COPY } from "./copy.ts";
import styles from "./Word.module.css";

/** The slip: her errand in her words, stamped once the word is given. */
function Slip({ given }: { given: boolean }): JSX.Element {
  return (
    <figure className={styles.slip} data-s data-given={given ? "" : undefined} style={{ "--i": 2 } as never}>
      <img src={pieceSrc("slip")} alt="" width={PIECES.slip.width} height={PIECES.slip.height} />
      <figcaption className={styles.errand}>
        {COPY.word.slip.map((line) => <span key={line}>{line}</span>)}
        <span className={`stamp ${styles.stampMark}`} aria-hidden={!given}>{COPY.word.stamp}</span>
      </figcaption>
    </figure>
  );
}

export function Word(): JSX.Element {
  const stage = useRef<HTMLDivElement>(null);
  const [given, setGiven] = useState(false);
  const { speak } = useSound();
  useTilt(stage);
  const onGiven = (): void => { setGiven(true); speak("word-saathi"); };
  return (
    <Act id="word" name="word" eyebrow={COPY.word.eyebrow} title={COPY.word.title}
      stage={
        <Theatre scene={SCENES.word} stageRef={stage} overlay={<Slip given={given} />}
          cast={
            <>
              <Cast name="shopper" x={30} w={16} i={0} beat="word-shopper" label="the shopper" />
              <Cast name="saathi" x={68} w={17} i={2} label="Saathi" />
            </>
          }
        />
      }
    >
      <p>{COPY.word.body}</p>
      <Seal label={COPY.word.seal} doneLabel={COPY.word.sealed} onComplete={onGiven} />
    </Act>
  );
}
```

`apps/landing/src/acts/Word.module.css`:
```css
.slip {
  position: absolute;
  top: 9%;
  left: 52%;
  width: 34%;
  margin: 0;
  transform: rotate(-3deg);
}
.slip img { display: block; width: 100%; height: auto; }
.errand {
  position: absolute;
  inset: 14% 10%;
  display: grid;
  align-content: start;
  gap: 2px;
  font-family: var(--font-display);
  font-variation-settings: "opsz" 48, "wght" 400;
  font-style: italic;
  font-size: clamp(11px, 1.9cqw, 22px);
  line-height: 1.25;
  color: var(--ink);
}
.stampMark {
  position: absolute;
  right: 4%;
  bottom: 8%;
  color: var(--crimson);
  border-color: var(--crimson);
  opacity: 0;
  transform: rotate(-8deg) scale(1.6);
  transition: opacity var(--d-stamp) var(--ease-stamp), transform var(--d-stamp) var(--ease-stamp);
}
.slip[data-given] .stampMark { opacity: 1; transform: rotate(-8deg) scale(1); }
```

- [ ] **Step 2: Look**

Browser pane, scroll to `#word`: the shopper rises first, Saathi a beat later; the slip sits over the stage with the three lines; press and hold the seal for 600 ms: the "given" stamp lands on the slip; with sound on, the shopper's line played on entry and Saathi's on the stamp.

- [ ] **Step 3: Gates and commit**

```bash
git add apps/landing/src/acts/Word.tsx apps/landing/src/acts/Word.module.css apps/landing/src/Show.tsx
git commit -m "feat(landing): act one, your word on a slip, sealed by a hold"
```

---

### Task 6: Act two, The walk, and turning the stage around

**Files:**
- Create: `apps/landing/src/acts/Walk.tsx`, `Walk.module.css`
- Modify: `apps/landing/src/Show.tsx` (add `<Walk />`), `apps/landing/src/stage/Theatre.module.css` (the walk keyframes)

**Interfaces:**
- Consumes: `Theatre` with `back` and `side`; `COPY.walk`; `pieceSrc("back")`; `/stage/window.jpg`.

- [ ] **Step 1: The act**

`apps/landing/src/acts/Walk.tsx`:
```tsx
import { useRef, useState, type JSX } from "react";
import { useTilt } from "../motion/useTilt.ts";
import { Cast } from "../stage/Cast.tsx";
import { PIECES, pieceSrc } from "../stage/pieces.ts";
import { SCENES } from "../stage/scenes.ts";
import { Theatre } from "../stage/Theatre.tsx";
import { Act } from "./Act.tsx";
import { COPY } from "./copy.ts";
import styles from "./Walk.module.css";

/** The back of the theatre: the hands, the sticks, and the real window. */
function Back(): JSX.Element {
  return (
    <div className={styles.back}>
      <img className={styles.backPlate} src={pieceSrc("back")} alt="" width={PIECES.back.width} height={PIECES.back.height} loading="lazy" />
      <figure className={styles.window}>
        <img src="/stage/window.jpg" alt={COPY.walk.window} width={1280} height={800} loading="lazy" />
        <figcaption className="label">{COPY.walk.window}</figcaption>
      </figure>
    </div>
  );
}

export function Walk(): JSX.Element {
  const stage = useRef<HTMLDivElement>(null);
  const [turned, setTurned] = useState(false);
  useTilt(stage);
  return (
    <Act id="window" name="walk" eyebrow={COPY.walk.eyebrow} title={COPY.walk.title}
      stage={
        <Theatre scene={SCENES.walk} stageRef={stage} side={turned ? "back" : "front"} back={<Back />}
          cast={
            <div className={styles.walker}>
              <Cast name="saathi" x={30} w={17} i={0} beat="walk-saathi" label="Saathi" />
              <Cast name="shopkeeper" x={76} w={16} i={1} beat="walk-keeper" label="the shopkeeper" />
            </div>
          }
        />
      }
    >
      <p>{COPY.walk.body}</p>
      <button type="button" className={styles.turn} aria-pressed={turned} onClick={() => setTurned((t) => !t)}>
        {turned ? COPY.walk.back : COPY.walk.turn}
      </button>
    </Act>
  );
}
```

`apps/landing/src/acts/Walk.module.css`:
```css
/* The walk is scroll-driven: the whole cast plane crosses the stage as the
   theatre passes through the viewport, so Saathi walks the shops at the
   visitor's own pace. Behind the support gate the cast simply stands. */
.walker { position: absolute; inset: 0; }
@supports (animation-timeline: view()) {
  @media (prefers-reduced-motion: no-preference) {
    .walker { animation: walk linear both; animation-timeline: view(); animation-range: entry 20% exit 80%; }
  }
}
@keyframes walk { from { translate: -14% 0; } to { translate: 14% 0; } }

.back { position: absolute; inset: 0; }
.backPlate { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.window {
  position: absolute;
  left: 50%;
  top: 12%;
  width: 46%;
  margin: 0;
  transform: translateX(-50%);
  padding: 2% 2% 1.2%;
  background: #cdb894;
  box-shadow: 0 3px 0 rgba(0, 0, 0, 0.18);
  display: grid;
  gap: 6px;
}
.window img { display: block; width: 100%; height: auto; }
.turn {
  justify-self: start;
  font-family: var(--font-data);
  font-size: var(--t-label);
  letter-spacing: var(--t-label-tracking);
  text-transform: uppercase;
  color: var(--indigo);
  padding: var(--sp-4) 0;
  border-bottom: 1px solid currentColor;
}
```

- [ ] **Step 2: Look**

Browser pane, scroll through `#window` slowly: Saathi and the shopkeeper cross the stage with the scroll; click "turn the stage around": the theatre flips to its back, hands on sticks, the real window on a card; the button now says "turn it back". Reduced motion (emulate in the pane): the flip is instant. Mobile: the back plate is legible.

- [ ] **Step 3: Gates and commit**

```bash
git add apps/landing/src/acts/Walk.tsx apps/landing/src/acts/Walk.module.css apps/landing/src/Show.tsx
git commit -m "feat(landing): act two, the walk, and the stage turned around"
```

---

### Task 7: Act three, The refusal

**Files:**
- Create: `apps/landing/src/acts/Refusal.tsx`, `Refusal.module.css`, `apps/landing/src/acts/useTries.ts`
- Create: `apps/landing/tests/tries.test.ts`
- Modify: `apps/landing/src/Show.tsx` (add `<Refusal />`)

**Interfaces:**
- Produces: `useTries(onTry: (n: number) => void): { tries: number; down: boolean; tryAgain(): void; begin(): void }` and the pure `nextTry(n: number): number`.

- [ ] **Step 1: Failing test for the try counter**

`apps/landing/tests/tries.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { STAMP_SPOTS, spotFor } from "../src/acts/useTries.ts";

describe("the tout's tries", () => {
  it("lands each stamp on its own spot, then goes round again", () => {
    const spots = [1, 2, 3, 4, 5].map(spotFor);
    expect(new Set(spots.slice(0, STAMP_SPOTS.length)).size).toBe(STAMP_SPOTS.length);
    expect(spotFor(STAMP_SPOTS.length + 1)).toEqual(spotFor(1));
  });
});
```

- [ ] **Step 2: The tries hook**

`apps/landing/src/acts/useTries.ts`:
```ts
import { useCallback, useEffect, useRef, useState } from "react";

export interface Spot { readonly x: number; readonly y: number; readonly rot: number; }

/** Where the stamps land, in percent of the stage, so a pile reads as a pile. */
export const STAMP_SPOTS: readonly Spot[] = [
  { x: 56, y: 26, rot: -9 }, { x: 40, y: 20, rot: 6 }, { x: 62, y: 44, rot: -4 },
  { x: 34, y: 42, rot: 11 }, { x: 50, y: 12, rot: -13 }, { x: 68, y: 18, rot: 3 },
];

export function spotFor(n: number): Spot {
  return STAMP_SPOTS[(n - 1) % STAMP_SPOTS.length]!;
}

const DOWN_MS = 420;
const FIRST_MS = 900;
const SECOND_MS = 2600;

/*
 * The tout drops, comes back with the next line, and is refused. Two tries
 * happen on their own when the act arrives; every one after that is the
 * visitor's doing. Timers are cleared on unmount so a fast scroll never
 * leaves a stamp landing on an empty stage.
 */
export function useTries(onTry: (n: number) => void): { tries: number; down: boolean; tryAgain(): void; begin(): void } {
  const [tries, setTries] = useState(0);
  const [down, setDown] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const later = useCallback((ms: number, fn: () => void): void => { timers.current.push(setTimeout(fn, ms)); }, []);

  const tryAgain = useCallback((): void => {
    setDown(true);
    later(DOWN_MS, () => {
      setDown(false);
      setTries((n) => { const next = n + 1; onTry(next); return next; });
    });
  }, [later, onTry]);

  const begun = useRef(false);
  const begin = useCallback((): void => {
    if (begun.current) return;
    begun.current = true;
    later(FIRST_MS, tryAgain);
    later(SECOND_MS, tryAgain);
  }, [later, tryAgain]);

  useEffect(() => () => { for (const t of timers.current) clearTimeout(t); }, []);
  return { tries, down, tryAgain, begin };
}
```

- [ ] **Step 3: The act**

`apps/landing/src/acts/Refusal.tsx`:
```tsx
import { useEffect, useRef, type JSX } from "react";
import { useTilt } from "../motion/useTilt.ts";
import { useSound } from "../sound/SoundContext.tsx";
import { Cast } from "../stage/Cast.tsx";
import { SCENES } from "../stage/scenes.ts";
import { Theatre } from "../stage/Theatre.tsx";
import { Act } from "./Act.tsx";
import { COPY } from "./copy.ts";
import styles from "./Refusal.module.css";
import { spotFor, useTries } from "./useTries.ts";

function Stamps({ count }: { count: number }): JSX.Element {
  return (
    <div className={styles.stamps} aria-live="polite" aria-atomic="true">
      {Array.from({ length: count }, (_, i) => i + 1).map((n) => {
        const spot = spotFor(n);
        return (
          <span key={n} className={`stamp ${styles.refused}`} style={{ "--x": `${spot.x}%`, "--y": `${spot.y}%`, "--rot": `${spot.rot}deg` } as never}>
            {COPY.refusal.stamp}
          </span>
        );
      })}
    </div>
  );
}

export function Refusal(): JSX.Element {
  const stage = useRef<HTMLDivElement>(null);
  const { speak } = useSound();
  useTilt(stage);
  const { tries, down, tryAgain, begin } = useTries((n) => {
    speak("refusal-tout", n - 1, true);
    if (n === 2) speak("refusal-saathi");
  });
  // The act begins when the tout's wrapper is marked in by the observer.
  const tout = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = tout.current;
    if (el === null) return;
    const mo = new MutationObserver(() => { if (el.classList.contains("in")) { begin(); mo.disconnect(); } });
    mo.observe(el, { attributes: true, attributeFilter: ["class"] });
    return () => mo.disconnect();
  }, [begin]);
  return (
    <Act id="refusals" name="refusal" eyebrow={COPY.refusal.eyebrow} title={COPY.refusal.title}
      stage={
        <Theatre scene={SCENES.refusal} stageRef={stage} overlay={<Stamps count={tries} />}
          cast={
            <>
              <Cast name="saathi" x={34} w={17} i={0} label="Saathi" />
              <Cast name="tout" x={68} w={17} i={1} down={down} onClick={tryAgain} label={COPY.refusal.again} stickRef={tout} />
            </>
          }
        />
      }
    >
      <p>{COPY.refusal.body}</p>
      <p className={`${styles.count} tabular`}>{COPY.refusal.count(tries)}</p>
    </Act>
  );
}
```

`apps/landing/src/acts/Refusal.module.css`:
```css
.stamps { position: absolute; inset: 0; pointer-events: none; }
.refused {
  position: absolute;
  left: var(--x);
  top: var(--y);
  font-size: clamp(12px, 2.2cqw, 26px);
  padding: 0.25em 0.6em;
  color: var(--crimson);
  border: 2px solid currentColor;
  transform: rotate(var(--rot)) scale(1);
  animation: land var(--d-stamp) var(--ease-stamp) both;
}
@keyframes land { from { transform: rotate(var(--rot)) scale(1.8); opacity: 0; } to { transform: rotate(var(--rot)) scale(1); opacity: 1; } }
.count { font-family: var(--font-data); font-size: var(--t-data-m); line-height: var(--t-data-m-line); color: var(--ink); }
```

Note: the MutationObserver watches one element's class list and is disconnected on the first `in`; it is not a scroll listener and not a second IntersectionObserver.

- [ ] **Step 4: Look**

Browser pane, scroll to `#refusals`: both puppets rise; after about a second the tout drops and pops back, a REFUSED stamp lands; again at 2.6 s; the count reads "asked 2 times, refused 2 times, it does not tire."; clicking the tout adds a try and a stamp each time; with sound on, each try speaks a different tout line and Saathi's refusal plays after the second.

- [ ] **Step 5: Gates and commit**

```bash
git add apps/landing/src/acts/Refusal.tsx apps/landing/src/acts/Refusal.module.css apps/landing/src/acts/useTries.ts apps/landing/tests/tries.test.ts apps/landing/src/Show.tsx
git commit -m "feat(landing): act three, the tout is refused every time"
```

---

### Task 8: Act four, The bill

**Files:**
- Create: `apps/landing/src/acts/Bill.tsx`, `Bill.module.css`
- Modify: `apps/landing/src/Show.tsx` (add `<Bill />`)

- [ ] **Step 1: The act**

`apps/landing/src/acts/Bill.tsx`:
```tsx
import { useRef, type JSX } from "react";
import { useTilt } from "../motion/useTilt.ts";
import { Cast } from "../stage/Cast.tsx";
import { PIECES, pieceSrc } from "../stage/pieces.ts";
import { SCENES } from "../stage/scenes.ts";
import { Theatre } from "../stage/Theatre.tsx";
import { Act } from "./Act.tsx";
import { COPY } from "./copy.ts";
import styles from "./Bill.module.css";

function Line({ row, yours }: { row: readonly [string, string, string]; yours?: boolean }): JSX.Element {
  return (
    <li className={`${styles.row} ${yours ? styles.yours : ""}`}>
      <span className={`${styles.amount} tabular`}>{row[0]}</span>
      <span>{row[1]}</span>
      <span className={styles.who}>{row[2]}</span>
    </li>
  );
}

/** The hisaab, unrolled on the night stage, lit by one diya. */
function Scroll(): JSX.Element {
  return (
    <div className={styles.scroll} data-s style={{ "--i": 2 } as never}>
      <ol className={styles.lines}>
        {COPY.bill.others.map((row) => <Line key={row[1]} row={row} />)}
        <Line row={COPY.bill.yours} yours />
      </ol>
      <img className={styles.lamp} src={pieceSrc("lamp")} alt="" width={PIECES.lamp.width} height={PIECES.lamp.height} loading="lazy" />
    </div>
  );
}

export function Bill(): JSX.Element {
  const stage = useRef<HTMLDivElement>(null);
  useTilt(stage);
  return (
    <Act id="hisaab" name="bill" eyebrow={COPY.bill.eyebrow} title={COPY.bill.title}
      stage={
        <Theatre scene={SCENES.bill} stageRef={stage} overlay={<Scroll />}
          cast={<Cast name="saathi" x={26} w={16} i={0} beat="bill" label="Saathi" />}
        />
      }
    >
      <p>{COPY.bill.body}</p>
      <p className={styles.close}>{COPY.bill.close}</p>
    </Act>
  );
}
```

`apps/landing/src/acts/Bill.module.css`:
```css
.scroll {
  position: absolute;
  left: 44%;
  top: 12%;
  width: 44%;
  padding: 3% 3.5%;
  background: var(--paper);
  color: var(--ink);
  box-shadow: 0 4px 0 rgba(0, 0, 0, 0.35);
}
.lines { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.5em; font-size: clamp(10px, 1.55cqw, 17px); line-height: 1.3; }
.row { display: grid; grid-template-columns: auto 1fr auto; gap: 0.8em; align-items: baseline; padding-bottom: 0.45em; border-bottom: 1px solid var(--ink-12); color: var(--ink-55); }
.row.yours { color: var(--ink); border-bottom: 2px solid var(--marigold); }
.amount { font-family: var(--font-data); }
.who { font-family: var(--font-data); font-size: 0.8em; letter-spacing: 0.04em; text-transform: uppercase; }
.lamp { position: absolute; left: -22%; bottom: -14%; width: 30%; height: auto; }
.close {
  font-family: var(--font-accent);
  font-size: var(--t-display-l);
  line-height: 1.2;
  color: var(--ink);
}
```

- [ ] **Step 2: Look**

Browser pane, `#hisaab`: the night stage with the backlit glow behind three silhouette layers, the scroll with three greyed bills and one marigold-ruled line, the diya at its corner, Saathi risen at the left; "Sab theek hai." in the copy column.

- [ ] **Step 3: Gates and commit**

```bash
git add apps/landing/src/acts/Bill.tsx apps/landing/src/acts/Bill.module.css apps/landing/src/Show.tsx
git commit -m "feat(landing): act four, the bill by lamplight"
```

---

### Task 9: Curtain call, the page's own words, and the handover

**Files:**
- Create: `apps/landing/src/acts/Call.tsx`
- Modify: `apps/landing/src/Show.tsx` (final order: Hero, Word, Walk, Refusal, Bill, Call, Footer, Switch), `apps/landing/index.html` (title, description, og tags), `docs/landing-handover.md` (replace the STOP header), `docs/superpowers/plans/2026-09-05-katputli-show.md` (tick the boxes)

- [ ] **Step 1: The call**

`apps/landing/src/acts/Call.tsx`:
```tsx
import { useRef, type JSX } from "react";
import { useTilt } from "../motion/useTilt.ts";
import { Cast, type CastName } from "../stage/Cast.tsx";
import { SCENES } from "../stage/scenes.ts";
import { Theatre } from "../stage/Theatre.tsx";
import { Act } from "./Act.tsx";
import { COPY } from "./copy.ts";

const ORDER: readonly CastName[] = ["saathi", "shopper", "shopkeeper", "tout"];

/** Everyone bows, in the order they appeared. */
export function Call(): JSX.Element {
  const stage = useRef<HTMLDivElement>(null);
  useTilt(stage);
  return (
    <Act id="call" name="call" eyebrow={COPY.call.eyebrow} title={COPY.call.title}
      stage={
        <Theatre scene={SCENES.call} stageRef={stage}
          cast={ORDER.map((name, i) => <Cast key={name} name={name} x={20 + i * 20} w={15} i={i} bow label={name} />)}
        />
      }
    >
      <p>{COPY.call.body}</p>
    </Act>
  );
}
```

- [ ] **Step 2: index.html**

Title: `Saathi · a shopping agent that dances for you`. Description: `Saathi walks the shops in a window you can watch, refuses what you did not ask for, and buys nothing until you press and hold. A cardboard puppet show about an agent that stays under your hand.` Update the two `og:` tags to match.

- [ ] **Step 3: The JS-off and reduced-motion checks**

Run: `cd apps/landing && pnpm build` then open `dist/index.html` through `npx vite preview --port 5198` in the Browser pane with JavaScript disabled (or `curl -s http://localhost:5198/ | grep -c "Every agent dances"`): every act's title and body text appears in the baked HTML; the curtain is open; every puppet is up. Emulate reduced motion in the pane: no pops, no drift, the stick does not follow, the turnaround is instant.

- [ ] **Step 4: Screens**

Screenshot every act at desktop (1440 wide) and the mobile preset; look at all of them. Fix what is wrong before claiming anything.

- [ ] **Step 5: Handover**

Replace the STOP header of `docs/landing-handover.md` with a short "CURRENT STATE (2026-09-05)" section: the show is live from `Show.tsx`, the asset bake command, the voice set, the sound switch default, what remains (the loop's licence, the trailer). Keep every rule below it.

- [ ] **Step 6: Gates, commit, push**

```bash
git add -A apps/landing docs/landing-handover.md docs/superpowers/plans/2026-09-05-katputli-show.md
git commit -m "feat(landing): curtain call, page metadata, handover"
git push origin master
```

---

## Self-review

- Spec coverage: curtain up (Task 2), your word with the seal (5), the walk and the turnaround with the real window (6), the refusal loop with the count (7), the bill by night (8), the curtain call and footer (9), the stick (3), press and hold (5), sound switch and one-line-at-a-time voices (4), assets and voices shipped (1), JS-off and reduced motion (2, 9), house limits (every task's gates). The trailer is a separate track and not in this plan, as the spec says.
- Placeholders: none; every code step carries its code.
- Types: `Cast` props (`name x w i beat down bow onClick label stickRef`) match every use in Tasks 5 to 9; `Theatre` props (`scene cast overlay back side curtain stageRef className`) match Tasks 2, 5, 6, 7, 8, 9; `useSound().speak(beat, n, again)` matches Tasks 5 and 7; `useInView(onIn)` matches Task 4's Show.

---

## Addendum to Task 2: sky and clouds (founder request, 2026-09-05)

Day scenes get a paper sky and cut-paper clouds, and the hero's entrance
brings the clouds in as the curtain opens.

- The asset bake is `python apps/landing/scripts/pieces.py <dir>` (not an mjs); it adds two pieces, `cloudA` (wide) and `cloudB` (small, tall), to `PIECES`.
- In `Theatre.tsx`, for `scene.variant === "day"` render, between `.wall` and the first plane:

```tsx
<div className={styles.sky} aria-hidden="true">
  <img className={styles.cloud} src={pieceSrc("cloudA")} alt="" width={PIECES.cloudA.width} height={PIECES.cloudA.height} style={{ "--l": "6%", "--t": "8%", "--w": "26%", "--dur": "46s", "--from": "-30%" } as never} />
  <img className={styles.cloud} src={pieceSrc("cloudB")} alt="" width={PIECES.cloudB.width} height={PIECES.cloudB.height} style={{ "--l": "58%", "--t": "5%", "--w": "13%", "--dur": "38s", "--from": "30%" } as never} />
  <img className={styles.cloud} src={pieceSrc("cloudA")} alt="" width={PIECES.cloudA.width} height={PIECES.cloudA.height} style={{ "--l": "74%", "--t": "16%", "--w": "18%", "--dur": "54s", "--from": "40%" } as never} />
</div>
```

- In `Theatre.module.css`: the day wall is a paper sky, `background: linear-gradient(180deg, #dbe6ea 0%, #ece6d6 48%, #e8dcc3 62%, #e8dcc3 100%)`; the sky layer and clouds:

```css
.sky { position: absolute; inset: 0 0 42% 0; overflow: hidden; pointer-events: none; }
.cloud {
  position: absolute;
  left: var(--l);
  top: var(--t);
  width: var(--w);
  height: auto;
  translate: 0 0;
}
@media (prefers-reduced-motion: no-preference) {
  /* Two motions, two properties: the entrance owns transform, the drift
     owns translate, so neither cancels the other. */
  html[data-js] .cloud {
    animation:
      cloudArrive 1.8s cubic-bezier(0.2, 0.8, 0.2, 1) 0.6s both,
      cloudDrift var(--dur) ease-in-out 0.6s infinite alternate;
  }
}
@keyframes cloudArrive { from { transform: translateX(var(--from)); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
@keyframes cloudDrift { from { translate: 0 0; } to { translate: 4% -1.5%; } }
```

- The night scene keeps its backlit wall and no clouds.
- `tests/scenes.test.ts` stays as written; add to `tests/pieces.test.ts` nothing (the generated registry already covers the clouds).
