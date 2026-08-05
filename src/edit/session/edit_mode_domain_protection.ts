import type * as THREE from 'three';
import type { EditDomainTarget } from './edit_session_domain.js';

/**
 * Collects leaf scene objects that must remain while Edit Mode is open.
 *
 * @param domain Live Edit Mode domain targets.
 * @returns Domain leaf objects (meshes and solid roots as needed).
 */
export function collectEditDomainLeafObjects(domain: readonly EditDomainTarget[]): THREE.Object3D[] {
  const leaves: THREE.Object3D[] = [];
  for (const target of domain) {
    if (target.kind === 'content_mesh') {
      leaves.push(target.mesh);
      continue;
    }
    leaves.push(target.solidModel.root);
    const instance = target.solidModel.findBrush(target.brushId);
    if (instance?.mesh) {
      leaves.push(instance.mesh);
    }
    if (target.resultMesh) {
      leaves.push(target.resultMesh);
    }
  }
  return leaves;
}

/**
 * Returns whether deleting the candidate would remove an Edit Mode domain
 * object.
 *
 * @param candidate Hierarchy object requested for deletion.
 * @param domain Live Edit Mode domain targets.
 * @returns True when the candidate is protected.
 */
export function isObjectDeleteProtectedByEditDomain(
  candidate: THREE.Object3D,
  domain: readonly EditDomainTarget[],
): boolean {
  if (domain.length === 0) {
    return false;
  }
  for (const leaf of collectEditDomainLeafObjects(domain)) {
    if (wouldDeleteRemoveObject(candidate, leaf)) {
      return true;
    }
  }
  return false;
}

/**
 * Filters objects that may be deleted while Edit Mode is open.
 *
 * @param objects Candidates for deletion.
 * @param domain Live Edit Mode domain targets.
 * @returns Objects that are not protected by the domain.
 */
export function filterObjectsDeletableOutsideEditDomain(
  objects: readonly THREE.Object3D[],
  domain: readonly EditDomainTarget[],
): THREE.Object3D[] {
  if (domain.length === 0) {
    return objects.slice();
  }
  return objects.filter((object) => !isObjectDeleteProtectedByEditDomain(object, domain));
}

/**
 * Returns whether removing candidate from the scene would also remove target.
 *
 * @param candidate Object being deleted.
 * @param target Domain leaf that must stay.
 * @returns True when candidate is target or an ancestor of target.
 */
function wouldDeleteRemoveObject(candidate: THREE.Object3D, target: THREE.Object3D): boolean {
  if (candidate === target) {
    return true;
  }
  let current: THREE.Object3D | null = target.parent;
  while (current) {
    if (current === candidate) {
      return true;
    }
    current = current.parent;
  }
  return false;
}
