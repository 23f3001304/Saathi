// §2.1/§2.3 — no axes, no gridlines, no tooltip chrome. The anchoring
// defence: today's discount claim measured against 30-of-34-days reality.
import { useMemo, useState, type JSX, type MouseEvent } from "react";
import type { PricePoint } from "../api/types.ts";
import { paise } from "../primitives/formatMoney.ts";
import styles from "./PriceSparkline.module.css";

type PriceSparklineProps = {
  points: PricePoint[];
  width?: number;
  height?: number;
  caption?: string;
};

function modalPrice(points: PricePoint[]): number {
  const counts = new Map<number, number>();
  for (const p of points)
    counts.set(p.pricePaise, (counts.get(p.pricePaise) ?? 0) + 1);
  let best = points[0]?.pricePaise ?? 0;
  let bestCount = 0;
  for (const [price, count] of counts) {
    if (count > bestCount) {
      best = price;
      bestCount = count;
    }
  }
  return best;
}

function EmptySparkline({
  width,
  height,
}: {
  width: number;
  height: number;
}): JSX.Element {
  return (
    <svg
      width={width}
      height={height}
      className={styles.svg}
      role="img"
      aria-label="No price history yet"
    >
      <line
        x1={0}
        y1={height / 2}
        x2={width}
        y2={height / 2}
        className={styles.crosshair}
      />
    </svg>
  );
}

export function PriceSparkline({
  points,
  width = 120,
  height = 28,
  caption,
}: PriceSparklineProps): JSX.Element {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const modal = useMemo(() => modalPrice(points), [points]);
  const prices = points.map((p) => p.pricePaise);

  // Guard first: with no points, min/max collapse to ±Infinity and every
  // downstream coordinate becomes NaN — an invalid SVG attribute, not just
  // a visual glitch (React logs a DOM warning and the attribute is dropped).
  if (points.length === 0)
    return <EmptySparkline width={width} height={height} />;

  const max = Math.max(...prices, ...points.map((p) => p.listedMrpPaise ?? 0));
  const min = Math.min(...prices);
  const scaleY = (price: number): number =>
    height - ((price - min) / (max - min || 1)) * height;
  const stepX = width / Math.max(1, points.length - 1);
  const line = points
    .map(
      (p, i) => `${i === 0 ? "M" : "L"} ${i * stepX} ${scaleY(p.pricePaise)}`,
    )
    .join(" ");
  const bandY = scaleY(modal * 1.03);
  const bandHeight = scaleY(modal * 0.97) - bandY;
  const mrpDays = points.filter((p) => p.listedMrpPaise !== undefined).length;

  function handleMove(e: MouseEvent<SVGSVGElement>): void {
    const rect = e.currentTarget.getBoundingClientRect();
    setHoverIndex(
      Math.round(((e.clientX - rect.left) / rect.width) * (points.length - 1)),
    );
  }

  const hovered = hoverIndex !== null ? points[hoverIndex] : undefined;

  return (
    <div className={styles.wrap}>
      <svg
        width={width}
        height={height}
        className={styles.svg}
        onMouseMove={handleMove}
        onMouseLeave={() => setHoverIndex(null)}
        role="img"
        aria-label="Price history sparkline"
      >
        <rect
          x={0}
          y={bandY}
          width={width}
          height={Math.max(0, bandHeight)}
          className={styles.band}
        />
        {mrpDays > 0 && (
          <line
            x1={width - stepX * mrpDays}
            y1={2}
            x2={width}
            y2={2}
            className={styles.mrp}
          />
        )}
        <path d={line} className={styles.line} />
        <circle
          cx={width}
          cy={scaleY(prices[prices.length - 1] ?? modal)}
          r={3}
          className={styles.today}
        />
        {hovered !== undefined && hoverIndex !== null && (
          <>
            <line
              x1={hoverIndex * stepX}
              y1={0}
              x2={hoverIndex * stepX}
              y2={height}
              className={styles.crosshair}
            />
            <text
              x={Math.min(hoverIndex * stepX + 4, width - 40)}
              y={10}
              className={styles.readout}
            >
              {paise(hovered.pricePaise)}
            </text>
          </>
        )}
      </svg>
      {caption !== undefined && <p className={styles.caption}>{caption}</p>}
    </div>
  );
}
