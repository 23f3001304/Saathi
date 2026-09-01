import { useEffect, useState, type JSX } from "react";
import QRCode from "qrcode";

import styles from "./PayPanel.module.css";

type PaymentQrProps = {
  /** The payment link's own short URL. Never a hand-built `upi://` string. */
  url: string;
};

/**
 * The link as a QR, generated in this tab by the `qrcode` package — no image
 * service, nothing fetched, so the URL a shopper is about to trust never
 * leaves the browser to become a picture.
 *
 * SVG rather than the canvas renderer: it is pure JS, so it needs no canvas
 * and stays sharp at whatever size the panel gives it. `M` correction, black
 * on white, quiet zone kept — a QR on a screen is read across a room in poor
 * light, and the margin is the part people delete first and miss most.
 */
export function PaymentQr({ url }: PaymentQrProps): JSX.Element | null {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    QRCode.toString(url, {
      type: "svg",
      margin: 2,
      errorCorrectionLevel: "M",
      color: { dark: "#1e1e1eff", light: "#ffffffff" },
    })
      .then((svg) => {
        if (!cancelled) {
          setSrc(`data:image/svg+xml;utf8,${encodeURIComponent(svg)}`);
        }
      })
      .catch(() => {
        // A QR that cannot be drawn is simply absent; the URL beside it is
        // still the whole of what the shopper needs.
        if (!cancelled) setSrc(null);
      });
    return () => {
      cancelled = true;
    };
  }, [url]);

  if (src === null) return null;
  return (
    <img
      className={styles.qr}
      src={src}
      width={200}
      height={200}
      alt="Scan to open this payment link on your phone"
    />
  );
}
