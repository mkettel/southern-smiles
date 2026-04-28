/**
 * Tiny haptic helper. Uses the Vibration API where available
 * (Android Chrome, etc.). Silently no-ops on iOS/Safari.
 */
export function triggerHaptic(kind: "tick" | "success" | "warn") {
  if (typeof window === "undefined") return;
  const nav = window.navigator as Navigator & {
    vibrate?: (pattern: number | number[]) => boolean;
  };
  if (!nav.vibrate) return;
  try {
    if (kind === "tick") nav.vibrate(8);
    else if (kind === "success") nav.vibrate([10, 30, 14]);
    else if (kind === "warn") nav.vibrate([20, 40, 20]);
  } catch {
    // ignore
  }
}
