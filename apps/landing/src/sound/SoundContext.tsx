import { createContext, useContext, type JSX, type ReactNode } from "react";
import { useShowSound, type ShowSound } from "./useShowSound.ts";

const silent: ShowSound = {
  on: false,
  toggle: () => undefined,
  speak: () => undefined,
  speakFile: () => undefined,
  interrupt: () => undefined,
  hush: () => undefined,
};
const SoundContext = createContext<ShowSound>(silent);

export function SoundProvider({
  children,
}: {
  children: ReactNode;
}): JSX.Element {
  const sound = useShowSound();
  return (
    <SoundContext.Provider value={sound}>{children}</SoundContext.Provider>
  );
}

export function useSound(): ShowSound {
  return useContext(SoundContext);
}
