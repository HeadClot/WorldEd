import type { GridSnap } from './grid_snap.js';

/**
 * Applies temporary precision mode: disables grid snap while Shift is held and
 * restores the user snap preference when Shift is not held.
 *
 * @param gridSnap Live grid snap instance used by transform math.
 * @param shiftHeld True when Shift is held for this sample.
 * @param userSnapEnabled The user's snap preference (toolbar / settings).
 */
export function applyGridSnapPrecisionFromShift(
  gridSnap: GridSnap,
  shiftHeld: boolean,
  userSnapEnabled: boolean,
): void {
  if (shiftHeld) {
    gridSnap.setEnabled(false);
    return;
  }
  gridSnap.setEnabled(userSnapEnabled);
}

/**
 * Restores grid snap to the user preference after a drag ends so temporary
 * Shift precision mode cannot leak into later tools.
 *
 * @param gridSnap Live grid snap instance used by transform math.
 * @param userSnapEnabled The user's snap preference (toolbar / settings).
 */
export function restoreGridSnapUserPreference(gridSnap: GridSnap, userSnapEnabled: boolean): void {
  gridSnap.setEnabled(userSnapEnabled);
}
