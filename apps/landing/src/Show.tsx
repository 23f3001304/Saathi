import type { JSX } from "react";
import { ScrollShow } from "./show/ScrollShow.tsx";
import { SoundProvider } from "./sound/SoundContext.tsx";
import { Switch } from "./sound/Switch.tsx";

/** The whole show: one picture, one scroll, one switch. */
export function Show(): JSX.Element {
  return (
    <SoundProvider>
      <ScrollShow />
      <Switch />
    </SoundProvider>
  );
}
