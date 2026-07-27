/**
 * Interval between host-liveness checks in detached popups (milliseconds).
 * Short enough that Vite reloads and parent tab closes clean up promptly.
 */
export const DETACHED_HOST_WATCH_INTERVAL_MS = 500;

/**
 * Returns true when a detached popup's opener host is gone (parent tab closed,
 * navigated away, or fully reloaded by Vite). Safe to call across origins —
 * access errors count as a dead host.
 *
 * @param popupWindow Popup window that was opened by the editor.
 * @returns True when the popup should close itself.
 */
export function isDetachedHostGone(popupWindow: Window): boolean {
  try {
    const opener = popupWindow.opener as Window | null;
    if (!opener) return true;
    if (opener.closed) return true;
    return false;
  } catch {
    return true;
  }
}
