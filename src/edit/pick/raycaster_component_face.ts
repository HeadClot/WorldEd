import * as THREE from 'three';
import { RaycasterFaceSelection } from '@/selection/face/raycaster_face_selection.js';

/** Result of a face pick scoped to the edit domain. */
export interface ComponentFacePickResult {
  targetId: string;
  faceIndex: number;
  mesh: THREE.Mesh;
  hitPoint: THREE.Vector3;
}

/** Domain face pick candidate. */
export interface ComponentFacePickCandidate {
  targetId: string;
  mesh: THREE.Mesh;
}

/**
 * Picks a front-facing triangle on edit-domain meshes using the shared face
 * raycaster, then maps the mesh back to a domain target id.
 *
 * @param event Pointer event.
 * @param camera Camera.
 * @param pickElement Pick element.
 * @param candidates Domain meshes.
 * @param raycaster Shared face raycaster instance.
 * @returns Face pick result, or null.
 */
export function pickComponentFace(
  event: MouseEvent,
  camera: THREE.Camera,
  pickElement: HTMLElement,
  candidates: readonly ComponentFacePickCandidate[],
  raycaster: RaycasterFaceSelection = new RaycasterFaceSelection(),
): ComponentFacePickResult | null {
  if (candidates.length === 0) {
    return null;
  }
  const meshes = candidates.map((candidate) => candidate.mesh);
  const hit = raycaster.pickFace(event, camera, pickElement, meshes);
  if (!hit) {
    return null;
  }
  const match = candidates.find((candidate) => candidate.mesh === hit.mesh);
  if (!match) {
    return null;
  }
  return {
    targetId: match.targetId,
    faceIndex: hit.faceIndex,
    mesh: hit.mesh,
    hitPoint: hit.hitPoint,
  };
}
