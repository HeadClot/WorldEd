import * as THREE from 'three';

/** UserData key marking the solid model root group. */
export const SOLID_MODEL_USERDATA_KEY = 'isSolidModel';

/** UserData key marking the compiled CSG result mesh under a solid model. */
export const SOLID_MODEL_RESULT_USERDATA_KEY = 'isSolidModelResult';

/** UserData key storing per-triangle brush surface sources on the result mesh. */
export const SOLID_TRIANGLE_SOURCES_USERDATA_KEY = 'solidTriangleSources';

/**
 * Returns whether an object is a solid model root group. Brush meshes and the
 * result mesh do not match; use SolidModel.fromObject for those.
 *
 * @param object Candidate scene object.
 * @returns True only when the object itself is a solid model root.
 */
export function isSolidModelObject(object: THREE.Object3D): boolean {
  return object.userData[SOLID_MODEL_USERDATA_KEY] === true;
}

/**
 * Returns whether an object is the compiled result mesh of a solid model.
 *
 * @param object Candidate object.
 * @returns True for result meshes.
 */
export function isResultMesh(object: THREE.Object3D): boolean {
  return object.userData[SOLID_MODEL_RESULT_USERDATA_KEY] === true;
}
