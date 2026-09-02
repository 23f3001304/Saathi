import type { JSX, ReactNode } from "react";
import { Wordmark } from "../chrome/Wordmark.tsx";
import { Seal } from "../kolam/Seal.tsx";
import { BUILD_URL, DEMO_URL } from "../content/links.ts";
import styles from "./Story.module.css";

/*
 * A kathputli show, start to finish. Nothing on this page is editorial:
 * every scene is a photographed stage with the words floating in its
 * light. The show's argument is the puppet's oldest fact: every agent
 * dances for someone, and this one's strings stay in the shopper's hand.
 * Real photographs (credits: docs/landing-credits.md) wear one indigo
 * scrim so seven photographers read as one theatre.
 */

type SceneProps = {
  id?: string;
  img: string;
  alt: string;
  eager?: boolean;
  low?: boolean;
  children: ReactNode;
};

function Scene({ id, img, alt, eager, low, children }: SceneProps): JSX.Element {
  return (
    <section
      className={low ? `${styles.scene} ${styles.low}` : styles.scene}
      id={id}
    >
      <img
        className={styles.photo}
        src={img}
        alt={alt}
        loading={eager === true ? "eager" : "lazy"}
      />
      <div className={styles.scrim} aria-hidden="true" />
      <div className={styles.chapter}>{children}</div>
    </section>
  );
}

function S({ i, children }: { i?: number; children: ReactNode }): JSX.Element {
  return (
    <div data-s style={{ "--i": i ?? 0 } as never}>
      {children}
    </div>
  );
}

function Threshold(): JSX.Element {
  return (
    <Scene id="top" img="/img/stage-puppets.jpg" alt="Kathputli string puppets performing on a dark stage" eager low>
      <S i={0}>
        <p className={styles.kicker}>namaste · a kathputli show</p>
      </S>
      <S i={1}>
        <h2 className={styles.line}>Every agent dances for someone.</h2>
      </S>
      <S i={2}>
        <h1 className={styles.name}>
          <Wordmark mode="hero" />
        </h1>
      </S>
      <S i={3}>
        <p className={styles.sub}>
          A shopping agent whose strings stay in your hand. It asks first, you
          watch everything, and nothing is bought until you press and hold.
        </p>
      </S>
      <S i={4}>
        <p className={styles.ctaRow}>
          <a className={styles.cta} href={DEMO_URL}>
            watch the demo
          </a>
          <a className={styles.ctaGhost} href={BUILD_URL}>
            see how it is built
          </a>
        </p>
      </S>
      <a className={styles.cue} href="#worry">
        the story
        <svg width="10" height="8" viewBox="0 0 10 8" aria-hidden="true">
          <path d="M1 1 L5 6 L9 1" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      </a>
    </Scene>
  );
}

const SPENT = [
  ["₹18,999", "headphones, the premium ones"],
  ["₹1,29,000", "a better laptop, while it was there"],
  ["₹42,350", "flights, it thought you seemed tired"],
] as const;

function Worry(): JSX.Element {
  return (
    <Scene id="worry" img="/img/puppet-shadow.jpg" alt="A single string puppet in low light">
      <S i={0}>
        <p className={styles.kicker}>one · the worry</p>
      </S>
      <S i={1}>
        <h2 className={styles.line}>An agent with your card is a blank cheque.</h2>
      </S>
      <S i={2}>
        <ul className={styles.spent}>
          {SPENT.map(([amount, note]) => (
            <li key={amount}>
              <span className={styles.spentAmount}>{amount}</span>
              <span>{note}</span>
              <span className={styles.spentMark}>no one asked</span>
            </li>
          ))}
        </ul>
      </S>
      <S i={3}>
        <p className={styles.sub}>
          Most agents hold the card and promise to be careful. The promise is
          words. The card is real. You find out on the statement, after.
        </p>
      </S>
    </Scene>
  );
}

function Word(): JSX.Element {
  return (
    <Scene id="word" img="/img/diya-hands.jpg" alt="Hands shaping a clay diya">
      <S i={0}>
        <p className={styles.kicker}>two · your word</p>
      </S>
      <S i={1}>
        <h2 className={styles.line}>So you give your word, once.</h2>
      </S>
      <S i={2}>
        <p className={styles.vachan}>
          “A navy kurta. No more than ₹2,000. Refundable only.”
        </p>
      </S>
      <S i={3}>
        <p className={styles.sub}>
          You press and hold, and that sentence becomes the whole of what
          Saathi may do. Not a setting buried somewhere. A signature.
        </p>
      </S>
    </Scene>
  );
}

function Bazaar(): JSX.Element {
  return (
    <Scene id="shopping" img="/img/bazaar-lane.jpg" alt="A lit bazaar lane at night" low>
      <S i={0}>
        <p className={styles.kicker}>three · the bazaar</p>
      </S>
      <S i={1}>
        <h2 className={styles.line}>Your saathi walks the bazaar while you watch.</h2>
      </S>
      <S i={2}>
        <p className={styles.sub}>
          Every shop it enters, every page it reads, in a window you can see
          and take over at any moment. It holds the best one aside and comes
          back to ask, first.
        </p>
      </S>
    </Scene>
  );
}

const TRICKS = [
  "“Only 2 left, hurry.”",
  "“₹4,000 off, today only.”",
  "“Pay now, before the offer ends.”",
] as const;

function Tricks(): JSX.Element {
  return (
    <Scene id="refusals" img="/img/puppet-pair.jpg" alt="A pair of kathputli puppets among market stalls">
      <S i={0}>
        <p className={styles.kicker}>four · the tricks</p>
      </S>
      <S i={1}>
        <h2 className={styles.line}>The bazaar has a voice. Saathi does not dance to it.</h2>
      </S>
      <S i={2}>
        <ul className={styles.tricks}>
          {TRICKS.map((trick) => (
            <li key={trick}>
              <span>{trick}</span>
              <span className={styles.refusedStamp}>refused</span>
            </li>
          ))}
        </ul>
      </S>
      <S i={3}>
        <p className={styles.sub}>
          Scarcity lines, invented discounts, a tool that tried to move your
          money on its own: heard, written down, refused in your name.
        </p>
      </S>
    </Scene>
  );
}

function Hisaab(): JSX.Element {
  return (
    <Scene id="hisaab" img="/img/pigment-rows.jpg" alt="Rows of bright pigment cones at a market stall">
      <S i={0}>
        <p className={styles.kicker}>five · the hisaab</p>
      </S>
      <S i={1}>
        <h2 className={styles.line}>Every rupee, written where you can read it.</h2>
      </S>
      <S i={2}>
        <dl className={styles.ledger}>
          <div>
            <dt>you asked for</dt>
            <dd>a navy kurta, under ₹2,000</dd>
          </div>
          <div>
            <dt>the shop promised</dt>
            <dd>₹1,299, signed</dd>
          </div>
          <div>
            <dt>you pressed and held</dt>
            <dd>once</dd>
          </div>
          <div>
            <dt>paid</dt>
            <dd>₹1,299, exactly</dd>
          </div>
        </dl>
      </S>
      <S i={3}>
        <p className={styles.sub}>
          Hisaab is the account, kept honestly. You do not have to trust its
          memory; you can check it, line by line, any evening you like.
        </p>
      </S>
    </Scene>
  );
}

function Close(): JSX.Element {
  return (
    <Scene img="/img/rangoli-hand.jpg" alt="A hand drawing a rangoli in coloured powder" low>
      <S i={0}>
        <p className={styles.kicker}>six · your thumb</p>
      </S>
      <S i={1}>
        <h2 className={styles.line}>Nothing is bought without this.</h2>
      </S>
      <S i={2}>
        <div className={styles.sealRow}>
          <Seal size={92} label="press and hold" doneLabel="that is the whole trick" />
        </div>
      </S>
      <S i={3}>
        <p className={styles.ctaRow}>
          <a className={styles.cta} href={DEMO_URL}>
            watch the demo
          </a>
          <a className={styles.ctaGhost} href={BUILD_URL}>
            see how it is built
          </a>
        </p>
      </S>
      <S i={4}>
        <p className={styles.builtNote}>
          a five-minute walk-through · built for the razorpay ai buildathon
        </p>
      </S>
    </Scene>
  );
}

export function Story(): JSX.Element {
  return (
    <>
      <Threshold />
      <Worry />
      <Word />
      <Bazaar />
      <Tricks />
      <Hisaab />
      <Close />
    </>
  );
}
