import { useRef, type JSX } from "react";
import { Wordmark } from "../chrome/Wordmark.tsx";
import { Seal } from "../kolam/Seal.tsx";
import { useInkPressure } from "../motion/useInkPressure.ts";
import { BUILD_URL, DEMO_URL } from "../content/links.ts";
import styles from "./Hero.module.css";

/*
 * DECISION: type is the image. The first viewport is the name at a scale
 * that crops, laid over a Devanagari साथी ghost that bleeds off the top
 * edge, with ONE kolam line drawing itself through the whole composition:
 * in from the page edge, a knot beside the name, under the baseline, and
 * out the bottom toward the thread that underwrites every section after.
 * A kolam is a welcome drawn at a threshold in one unbroken line, and an
 * unbroken line is this product's whole promise; no other product can
 * claim the mark. The only card-shaped object in the viewport is the
 * product itself: the hold-to-sign seal, sitting on bare paper at the
 * statement's shoulder. Discoverable interactions: the wet ink of the
 * name under the cursor, and the seal that actually signs.
 */
const HERO_LINE =
  "M -24 60 " +
  "C 60 96 130 128 190 165 " +
  "a 10 10 0 1 0 20 6 " +
  "C 300 240 380 300 440 350 " +
  "C 520 420 640 480 760 512 " +
  "L 850 524 " +
  "a 10 10 0 0 0 20 0 a 10 10 0 0 0 -20 0 " +
  "L 980 530 " +
  "C 1090 545 1160 620 1195 700 " +
  "a 10 10 0 1 0 18 8 " +
  "C 1240 790 1268 860 1284 916";

function HeroLine(): JSX.Element {
  return (
    <svg
      className={styles.line}
      viewBox="0 0 1440 900"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      <path
        className={styles.lineInk}
        d={HERO_LINE}
        pathLength={1}
        strokeDasharray="1 1"
      />
    </svg>
  );
}

export function Hero(): JSX.Element {
  const nameRef = useRef<HTMLHeadingElement>(null);
  useInkPressure(nameRef);

  return (
    <section className={styles.hero} id="top" aria-label="Saathi">
      <p className={styles.ghost} aria-hidden="true" data-parallax="0.14">
        साथी
      </p>
      <HeroLine />
      <p className={styles.eyebrow}>namaste · नमस्ते</p>
      <h1 className={styles.name} ref={nameRef}>
        <Wordmark mode="hero" />
      </h1>
      <p className={styles.ruleRow}>
        <span>
          <span className={styles.ruleHindi}>साथी</span> · companion · the one
          who walks with you
        </span>
        <span className={styles.ruleRight}>
          a kolam is drawn at the threshold to welcome a guest in
        </span>
      </p>
      <div className={styles.lede}>
        <div className={styles.claim}>
          <p className={styles.statement}>
            The agent that cannot spend what you did not sign.
          </p>
          <p className={styles.beats}>
            it asks first · it shows everything · it stops where you said
          </p>
          <p className={styles.ctaRow}>
            <a className={styles.cta} href={DEMO_URL}>
              watch the demo
            </a>
            <a className={styles.cta} href={BUILD_URL}>
              see how it is built
            </a>
          </p>
        </div>
        <figure className={styles.sealSpot} data-reveal>
          <Seal
            size={96}
            label="every bill ends here"
            doneLabel="that is the whole trick"
          />
          <figcaption className={styles.sealNote}>
            press and hold · six hundred milliseconds · nothing is bought
            without it
          </figcaption>
        </figure>
      </div>
      <a className={styles.cue} href="#worry">
        come inside
        <svg width="10" height="8" viewBox="0 0 10 8" aria-hidden="true">
          <path
            d="M1 1 L5 6 L9 1"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
        </svg>
      </a>
    </section>
  );
}
