import * as THREE from 'three';

/** Default editor up in world space. */
export const EDITOR_DEFAULT_UP = new THREE.Vector3(0, 1, 0);

/** Default editor right in world space. */
export const EDITOR_DEFAULT_RIGHT = new THREE.Vector3(1, 0, 0);

/** Default editor forward in world space (Three.js look direction). */
export const EDITOR_DEFAULT_FORWARD = new THREE.Vector3(0, 0, -1);

/** Floor-like normal when |dot| with world Y exceeds this. */
const FLOOR_NORMAL_DOT = 0.9;

/** Orthonormal plane frame for the visual grid. */
export interface EditorPlaneFrame {
  origin: THREE.Vector3;
  uAxis: THREE.Vector3;
  vAxis: THREE.Vector3;
  normal: THREE.Vector3;
}

/**
 * Builds a unit normal from an arbitrary vector, falling back to default up.
 *
 * @param upCandidate Candidate up direction.
 * @returns Unit up vector.
 */
export function normalizeEditorUp(upCandidate: THREE.Vector3): THREE.Vector3 {
  const normal = upCandidate.clone();
  if (normal.lengthSq() < 1e-20) {
    return EDITOR_DEFAULT_UP.clone();
  }
  return normal.normalize();
}

/**
 * Builds a quaternion that maps default editor up onto the given world up.
 *
 * @param worldUp Target unit up in world space.
 * @returns Orientation quaternion (local editor → world).
 */
export function buildOrientationFromUp(worldUp: THREE.Vector3): THREE.Quaternion {
  const targetUp = normalizeEditorUp(worldUp);
  const quaternion = new THREE.Quaternion();
  quaternion.setFromUnitVectors(EDITOR_DEFAULT_UP, targetUp);
  return quaternion;
}

/**
 * Builds a stable orthonormal plane frame with the given normal as up.
 *
 * @param normal Plane normal (editor up).
 * @param origin Point on the plane.
 * @returns Origin plus unit U/V axes and normal.
 */
export function buildPlaneFrameFromNormal(normal: THREE.Vector3, origin: THREE.Vector3): EditorPlaneFrame {
  const unitNormal = normalizeEditorUp(normal);
  const uAxis = pickStablePlaneUAxis(unitNormal);
  const vAxis = new THREE.Vector3().crossVectors(unitNormal, uAxis).normalize();
  uAxis.crossVectors(vAxis, unitNormal).normalize();
  return {
    origin: origin.clone(),
    uAxis,
    vAxis,
    normal: unitNormal,
  };
}

/**
 * Returns the default world XZ floor frame at the origin.
 *
 * @returns Default plane frame.
 */
export function buildDefaultPlaneFrame(): EditorPlaneFrame {
  return {
    origin: new THREE.Vector3(0, 0, 0),
    uAxis: EDITOR_DEFAULT_RIGHT.clone(),
    vAxis: new THREE.Vector3(0, 0, 1),
    normal: EDITOR_DEFAULT_UP.clone(),
  };
}

/**
 * Chooses a stable U seed orthogonal to the plane normal.
 *
 * @param normal Unit plane normal.
 * @returns Unit U axis seed.
 */
function pickStablePlaneUAxis(normal: THREE.Vector3): THREE.Vector3 {
  if (Math.abs(normal.y) > FLOOR_NORMAL_DOT) {
    return EDITOR_DEFAULT_RIGHT.clone();
  }
  const horizontal = new THREE.Vector3().crossVectors(EDITOR_DEFAULT_UP, normal);
  if (horizontal.lengthSq() < 1e-12) {
    return EDITOR_DEFAULT_RIGHT.clone();
  }
  return horizontal.normalize();
}
