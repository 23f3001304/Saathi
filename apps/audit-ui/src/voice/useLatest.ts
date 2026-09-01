import { useEffect, useRef } from "react";

/**
 * The current value, readable from a callback that was captured earlier. The
 * speech ports keep whatever listener they were handed for a whole utterance,
 * so a closure over props would answer with the props of the render that
 * started the microphone.
 */
export function useLatest<T>(value: T): { current: T } {
  const ref = useRef(value);
  useEffect(() => {
    ref.current = value;
  });
  return ref;
}
