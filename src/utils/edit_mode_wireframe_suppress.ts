import type { Object3D } from 'three';

/**
 * UserData flag set while Edit Mode suppresses an object-mode wireframe helper.
 * Frame systems (edge fader, wireframe overlay sync) must leave these hidden.
 */
export const EDIT_MODE_WIREFRAME_SUPPRESSED_USERDATA_KEY = 'editModeWireframeSuppressed';

/** UserData key storing whether the helper was visible before suppress. */
export const EDIT_MODE_WIREFRAME_WAS_VISIBLE_USERDATA_KEY = 'editModeWireframeWasVisible';

/**
 * Returns whether Edit Mode has suppressed this wireframe helper.
 *
 * @param object Scene object to test.
 * @returns True while Edit Mode keeps the helper hidden.
 */
export function isEditModeWireframeSuppressed(object: Object3D): boolean {
  return object.userData[EDIT_MODE_WIREFRAME_SUPPRESSED_USERDATA_KEY] === true;
}
