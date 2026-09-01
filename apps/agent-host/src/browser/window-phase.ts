/**
 * What the run asserts about this window: whether anyone is looking at it, and
 * whether anything still needs it.
 *
 * DECISION: both live here rather than on `BrowserService`, because both are
 * facts about the *turn* and neither survives being confused with the window's
 * own lifetime. `relaunch()` closes before it opens; a flag reset on close
 * un-concealed a window research had just hidden, and a watcher count zeroed
 * on close lost a hold the errand was still relying on.
 *
 * `visible` is the research phase's answer to "is this a performance?" — no,
 * and so `BrowserService.view()` says there is nothing to look at, which is
 * what withholds the card, the frames and the sandbox beat together.
 *
 * `busy` is the answer to a harder question the idle sweep asks: is anybody
 * there? Its old answer was the frame-stream watcher count, and that was only
 * ever a proxy — true while a card was on screen, and *false for the whole of
 * a concealed research errand*. The first live run of the phase split had its
 * window reaped out from under it after two minutes: two `web_read`s failed,
 * the next `web_open` silently relaunched somewhere else, and the errand
 * reported that it could not read any listings. The agent holding the window
 * is somebody. It says so here.
 */
export class WindowPhase {
  private shown = true;
  private holds = 0;

  get visible(): boolean {
    return this.shown;
  }

  /** True while an errand is still working at this window. */
  get busy(): boolean {
    return this.holds > 0;
  }

  conceal(): void {
    this.shown = false;
  }

  reveal(): void {
    this.shown = true;
  }

  /** Taken for the length of an errand; the returned function releases it.
   *  Idempotent and floored at zero, because a hold taken before a relaunch is
   *  released after one, and a negative count would veto the sweep forever. */
  hold(): () => void {
    this.holds += 1;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.holds = Math.max(0, this.holds - 1);
    };
  }
}
