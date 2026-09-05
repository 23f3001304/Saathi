/**
 * The film element and the small sums around it.
 *
 * One <video>, muted, never played. The scroll runtime owns the clock, so
 * the film is scrubbed rather than run: every frame the element is asked to
 * stand at the reader's position and whatever picture it is holding is what
 * gets drawn. Nothing here loops, listens to the page or waits its turn.
 */

/** The concatenated show, five scenes long, served from the public folder. */
export const FILM_SRC = "/stage/film.mp4";

/** How long the page waits for the film to say how long it is. */
export const METADATA_MS = 12000;

/** Closer than a frame at thirty and a seek would only cost a decode. */
export const SEEK_EPSILON = 1 / 30;

const HAVE_METADATA = 1;
const HAVE_CURRENT_DATA = 2;

/* Out of the way but in the page: a detached element is not decoded
   everywhere, and display:none is not drawn everywhere either. */
const OFFSCREEN =
  "position:fixed;left:0;top:0;width:1px;height:1px;opacity:0;pointer-events:none;";

export function createFilm(src: string = FILM_SRC): HTMLVideoElement {
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.setAttribute("aria-hidden", "true");
  video.setAttribute("style", OFFSCREEN);
  video.src = src;
  document.body.appendChild(video);
  return video;
}

/**
 * Resolves when the film has said how long it is, and rejects when it says
 * it cannot be read or says nothing at all. The caller reads the rejection
 * as "there is no film yet" and puts the built stage up instead.
 */
export function filmReady(
  video: HTMLVideoElement,
  ms: number = METADATA_MS,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const settle = (failure: string | null): void => {
      clearTimeout(timer);
      video.removeEventListener("loadedmetadata", arrived);
      video.removeEventListener("error", broke);
      if (failure === null) resolve();
      else reject(new Error(failure));
    };
    const arrived = (): void => settle(null);
    const broke = (): void => settle("the film could not be read");
    /* The clock is written last and read first: nothing can call settle
       until the listeners are on and this line has run. */
    const timer = setTimeout(() => settle("the film did not arrive"), ms);
    video.addEventListener("loadedmetadata", arrived);
    video.addEventListener("error", broke);
    if (video.readyState >= HAVE_METADATA) arrived();
  });
}

/** Where the film should stand for this scroll position, in seconds. */
export function targetTime(progress: number, duration: number): number {
  if (!Number.isFinite(duration) || duration <= 0) return 0;
  const at = progress * duration;
  return at < 0 ? 0 : at > duration ? duration : at;
}

/** A seek earns its decode only when the picture would actually move. */
export function seekWanted(target: number, last: number): boolean {
  return Math.abs(target - last) > SEEK_EPSILON;
}

/** True once the element holds a picture worth drawing. */
export function hasPicture(video: HTMLVideoElement): boolean {
  return video.readyState >= HAVE_CURRENT_DATA && video.videoWidth > 0;
}

/** Put it down: stop the fetch, stop the element, take it off the page. */
export function removeFilm(video: HTMLVideoElement): void {
  video.pause();
  video.removeAttribute("src");
  video.load();
  video.remove();
}
