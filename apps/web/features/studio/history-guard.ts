/** Keep a same-URL history entry ahead of Studio so one Back is reviewable. */
export function installStudioBackGuard(
  browser: Pick<Window, "history" | "location" | "addEventListener" | "removeEventListener">,
  canLeave: () => Promise<boolean>,
  fallback: () => void,
): () => void {
  const studioUrl = browser.location.href;
  const previousState = browser.history.state as Record<string, unknown> | null;
  const existingMarker = previousState && typeof previousState.stellarStudioGuard === "string" ? previousState.stellarStudioGuard : null;
  const marker = existingMarker ?? `studio-${crypto.randomUUID()}`;
  const hadPreviousEntry = existingMarker
    ? previousState?.stellarStudioHadPrevious === true
    : browser.history.length > 1;
  const arm = () => browser.history.pushState({ ...browser.history.state, stellarStudioGuard: marker, stellarStudioHadPrevious: hadPreviousEntry }, "", studioUrl);
  // A reload or remount may already be on the sentinel entry. Reuse it rather
  // than stacking another same-URL entry that would trap Back in Studio.
  if (!existingMarker) browser.history.pushState({ ...browser.history.state, stellarStudioGuard: marker, stellarStudioHadPrevious: hadPreviousEntry }, "", studioUrl);
  let active = true;
  let handling = false;
  let leaving = false;

  const onPopState = () => {
    if (!active || leaving) return;
    // A browser Back from the sentinel reaches the prior, same-URL Studio
    // entry. Re-arm synchronously so repeated Back cannot skip the draft dialog.
    if (browser.location.href !== studioUrl) return;
    arm();
    if (handling) return;
    handling = true;
    void canLeave().then((allowed) => {
      handling = false;
      if (!active || !allowed) return;
      leaving = true;
      if (hadPreviousEntry) browser.history.go(-2);
      else fallback();
    }).catch(() => { handling = false; });
  };
  browser.addEventListener("popstate", onPopState);
  return () => { active = false; browser.removeEventListener("popstate", onPopState); };
}
